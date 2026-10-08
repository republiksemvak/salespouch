-- Piutang Outlet is the monetary value of active consignment stock still held by each outlet.
-- This deliberately does NOT use historical remaining_debt. It mirrors the stock basis
-- used by loadLastVisit(): latest consignment visit that still has active stock,
-- with accumulation keeping line_items.remaining and new consignment quantities.
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
    FROM public.transactions t
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
        FROM jsonb_array_elements(COALESCE(v.line_items, '[]'::jsonb)) item
      ), 0)
      +
      COALESCE((
        SELECT SUM(GREATEST(COALESCE((item->>'qty')::numeric, 0), 0))
        FROM jsonb_array_elements(COALESCE(v.new_consignment_items, '[]'::jsonb)) item
      ), 0) AS active_qty
    FROM consignment_visits v
  ),
  selected AS (
    SELECT DISTINCT ON (outlet_id)
      *
    FROM active_visits
    WHERE active_qty > 0
    ORDER BY outlet_id, visit_date DESC, created_at DESC, id DESC
  ),
  line_values AS (
    SELECT
      s.outlet_id,
      s.visit_date,
      GREATEST(COALESCE((item->>'remaining')::numeric, 0), 0) AS qty,
      COALESCE((item->>'price')::numeric, 0) AS price,
      GREATEST(COALESCE((item->>'pcs_per_pack')::numeric, 1), 1) AS pcs_per_pack
    FROM selected s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN s.stock_scheme = 'accumulation' THEN COALESCE(s.line_items, '[]'::jsonb)
        ELSE '[]'::jsonb
      END
    ) item

    UNION ALL

    SELECT
      s.outlet_id,
      s.visit_date,
      GREATEST(COALESCE((item->>'qty')::numeric, 0), 0) AS qty,
      COALESCE((item->>'price')::numeric, 0) AS price,
      GREATEST(COALESCE((item->>'pcs_per_pack')::numeric, 1), 1) AS pcs_per_pack
    FROM selected s
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(s.new_consignment_items, '[]'::jsonb)
    ) item
  ),
  totals AS (
    SELECT
      outlet_id,
      MAX(visit_date) AS stock_since,
      SUM(qty) AS stock_pcs,
      SUM((qty * price) / pcs_per_pack) AS receivable_value
    FROM line_values
    GROUP BY outlet_id
  )
  SELECT
    o.id,
    o.name,
    o.owner_phone,
    COALESCE(t.stock_pcs, 0)::numeric,
    COALESCE(t.receivable_value, 0)::numeric,
    t.stock_since
  FROM public.outlets o
  JOIN totals t ON t.outlet_id = o.id
  WHERE o.user_id = _resolved_owner_id
    AND t.receivable_value > 0
  ORDER BY t.receivable_value DESC, o.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_outlet_receivables_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_outlet_receivables_v1(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
