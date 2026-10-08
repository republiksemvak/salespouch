-- Fix ambiguous output-column references in get_outlet_receivables_v1.
-- PostgreSQL treats RETURNS TABLE names as PL/pgSQL variables, so every
-- internal outlet_id reference must be explicitly qualified.

CREATE OR REPLACE FUNCTION public.get_outlet_receivables_v1(_owner_id uuid)
RETURNS TABLE (
  outlet_id uuid,
  outlet_name text,
  phone text,
  stock_pcs numeric,
  receivable_value numeric,
  stock_since timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _resolved_owner_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  _resolved_owner_id := public.business_owner_id();

  IF _resolved_owner_id IS NULL OR _owner_id IS DISTINCT FROM _resolved_owner_id THEN
    RAISE EXCEPTION 'Akses bisnis tidak valid.';
  END IF;

  IF NOT public.is_business_owner() AND NOT public.has_team_permission('transactions') THEN
    RAISE EXCEPTION 'Tidak memiliki akses piutang outlet.';
  END IF;

  RETURN QUERY
  WITH consignment_visits AS (
    SELECT
      t.id,
      t.outlet_id,
      t.visit_date,
      t.created_at,
      t.stock_scheme,
      t.line_items,
      t.new_consignment_items
    FROM public.transactions AS t
    WHERE t.user_id = _resolved_owner_id
      AND t.transaction_type = 'Consignment'
  ),
  active_visits AS (
    SELECT
      v.*,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN v.stock_scheme = 'accumulation'
              THEN GREATEST(COALESCE((item->>'remaining')::numeric, 0), 0)
            ELSE 0
          END
        )
        FROM jsonb_array_elements(COALESCE(v.line_items, '[]'::jsonb)) AS item
      ), 0)
      +
      COALESCE((
        SELECT SUM(GREATEST(COALESCE((item->>'qty')::numeric, 0), 0))
        FROM jsonb_array_elements(COALESCE(v.new_consignment_items, '[]'::jsonb)) AS item
      ), 0) AS active_qty
    FROM consignment_visits AS v
  ),
  selected AS (
    SELECT DISTINCT ON (av.outlet_id)
      av.*
    FROM active_visits AS av
    WHERE av.active_qty > 0
    ORDER BY av.outlet_id, av.visit_date DESC, av.created_at DESC, av.id DESC
  ),
  line_values AS (
    SELECT
      s.outlet_id AS lv_outlet_id,
      s.visit_date AS lv_visit_date,
      GREATEST(COALESCE((item->>'remaining')::numeric, 0), 0) AS qty,
      COALESCE((item->>'price')::numeric, 0) AS price,
      GREATEST(COALESCE((item->>'pcs_per_pack')::numeric, 1), 1) AS pcs_per_pack
    FROM selected AS s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN s.stock_scheme = 'accumulation' THEN COALESCE(s.line_items, '[]'::jsonb)
        ELSE '[]'::jsonb
      END
    ) AS item

    UNION ALL

    SELECT
      s.outlet_id AS lv_outlet_id,
      s.visit_date AS lv_visit_date,
      GREATEST(COALESCE((item->>'qty')::numeric, 0), 0) AS qty,
      COALESCE((item->>'price')::numeric, 0) AS price,
      GREATEST(COALESCE((item->>'pcs_per_pack')::numeric, 1), 1) AS pcs_per_pack
    FROM selected AS s
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(s.new_consignment_items, '[]'::jsonb)
    ) AS item
  ),
  totals AS (
    SELECT
      lv.lv_outlet_id AS total_outlet_id,
      MAX(lv.lv_visit_date) AS total_stock_since,
      SUM(lv.qty) AS total_stock_pcs,
      SUM((lv.qty * lv.price) / lv.pcs_per_pack) AS total_receivable_value
    FROM line_values AS lv
    GROUP BY lv.lv_outlet_id
  )
  SELECT
    o.id AS outlet_id,
    o.name AS outlet_name,
    o.owner_phone AS phone,
    COALESCE(t.total_stock_pcs, 0)::numeric AS stock_pcs,
    COALESCE(t.total_receivable_value, 0)::numeric AS receivable_value,
    t.total_stock_since AS stock_since
  FROM public.outlets AS o
  JOIN totals AS t ON t.total_outlet_id = o.id
  WHERE o.user_id = _resolved_owner_id
    AND t.total_receivable_value > 0
  ORDER BY t.total_receivable_value DESC, o.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_outlet_receivables_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_outlet_receivables_v1(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
