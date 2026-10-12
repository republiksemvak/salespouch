-- Produk terlaris per outlet berdasarkan kuantitas yang benar-benar terjual.
-- line_items adalah JSONB yang disimpan pada transaksi; nama kolom diverifikasi dari skema aplikasi.
CREATE OR REPLACE FUNCTION public.get_outlet_top_products(
  _owner_id uuid,
  _outlet_id uuid DEFAULT NULL,
  _days integer DEFAULT 90,
  _limit integer DEFAULT 5
)
RETURNS TABLE (
  outlet_id uuid,
  outlet_name text,
  product_name text,
  total_qty numeric,
  total_sales numeric,
  transaction_count bigint,
  last_sold_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    auth.uid() = _owner_id
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.owner_id = _owner_id
        AND tm.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to read outlet sales for this owner';
  END IF;

  IF _days < 1 OR _days > 3650 OR _limit < 1 OR _limit > 100 THEN
    RAISE EXCEPTION 'Invalid date range or result limit';
  END IF;

  IF _outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.outlets o
    WHERE o.id = _outlet_id AND o.user_id = _owner_id
  ) THEN
    RAISE EXCEPTION 'Outlet does not belong to this owner';
  END IF;

  RETURN QUERY
  WITH sold_lines AS (
    SELECT
      o.id AS outlet_id,
      o.name AS outlet_name,
      btrim(li.item ->> 'name') AS product_name,
      COALESCE(NULLIF(li.item ->> 'sold', '')::numeric, 0) AS qty,
      COALESCE(NULLIF(li.item ->> 'subtotal', '')::numeric, 0) AS sales,
      t.id AS transaction_id,
      t.visit_date
    FROM public.transactions t
    JOIN public.outlets o ON o.id = t.outlet_id AND o.user_id = _owner_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(t.line_items) = 'array' THEN t.line_items ELSE '[]'::jsonb END
    ) AS li(item)
    WHERE t.user_id = _owner_id
      AND t.visit_date >= now() - make_interval(days => _days)
      AND (_outlet_id IS NULL OR t.outlet_id = _outlet_id)
      AND COALESCE(NULLIF(li.item ->> 'sold', '')::numeric, 0) > 0
      AND NULLIF(btrim(li.item ->> 'name'), '') IS NOT NULL
  ),
  totals AS (
    SELECT
      s.outlet_id,
      s.outlet_name,
      s.product_name,
      SUM(s.qty)::numeric AS total_qty,
      SUM(s.sales)::numeric AS total_sales,
      COUNT(DISTINCT s.transaction_id)::bigint AS transaction_count,
      MAX(s.visit_date) AS last_sold_at
    FROM sold_lines s
    GROUP BY s.outlet_id, s.outlet_name, s.product_name
  ),
  ranked AS (
    SELECT
      totals.*,
      row_number() OVER (
        PARTITION BY totals.outlet_id
        ORDER BY totals.total_qty DESC, totals.total_sales DESC, totals.product_name
      ) AS rank_in_outlet
    FROM totals
  )
  SELECT
    ranked.outlet_id,
    ranked.outlet_name,
    ranked.product_name,
    ranked.total_qty,
    ranked.total_sales,
    ranked.transaction_count,
    ranked.last_sold_at
  FROM ranked
  WHERE ranked.rank_in_outlet <= _limit
  ORDER BY ranked.outlet_name, ranked.rank_in_outlet;
END;
$$;

REVOKE ALL ON FUNCTION public.get_outlet_top_products(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_outlet_top_products(uuid, uuid, integer, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
