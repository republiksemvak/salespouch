-- Premium-only access for report RPCs.
-- The application report page is gated separately; this protects report-specific
-- SECURITY DEFINER endpoints when called directly through PostgREST.
CREATE OR REPLACE FUNCTION public.business_has_premium_access(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = _owner_id
      AND (
        (p.license_until IS NOT NULL AND p.license_until > now())
        OR lower(coalesce(p.user_email, '')) IN (
          'candraprinting@gmail.com',
          'ganlapor@gmail.com',
          'republiksemvak@gmail.com'
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.business_has_premium_access(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_outlet_ar_aging()
RETURNS TABLE (
  outlet_id uuid,
  outlet_name text,
  phone text,
  address text,
  total_debt numeric,
  current_0_7 numeric,
  aging_8_14 numeric,
  aging_15_30 numeric,
  over_30 numeric,
  last_transaction_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _owner_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  _owner_id := public.business_owner_id();
  IF _owner_id IS NULL THEN RAISE EXCEPTION 'Bisnis tidak ditemukan.'; END IF;
  IF NOT public.business_has_premium_access(_owner_id) THEN
    RAISE EXCEPTION 'Laporan piutang tersedia pada paket Premium.';
  END IF;
  IF NOT public.is_business_owner() AND NOT public.has_team_permission('transactions') THEN
    RAISE EXCEPTION 'Tidak memiliki akses laporan piutang.'; 
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.owner_phone,
    NULL::text,
    COALESCE(latest.remaining_debt, 0)::numeric,
    CASE WHEN latest.remaining_debt > 0 AND latest.visit_date >= CURRENT_DATE - INTERVAL '7 days' THEN latest.remaining_debt ELSE 0 END,
    CASE WHEN latest.remaining_debt > 0 AND latest.visit_date >= CURRENT_DATE - INTERVAL '14 days' AND latest.visit_date < CURRENT_DATE - INTERVAL '7 days' THEN latest.remaining_debt ELSE 0 END,
    CASE WHEN latest.remaining_debt > 0 AND latest.visit_date >= CURRENT_DATE - INTERVAL '30 days' AND latest.visit_date < CURRENT_DATE - INTERVAL '14 days' THEN latest.remaining_debt ELSE 0 END,
    CASE WHEN latest.remaining_debt > 0 AND latest.visit_date < CURRENT_DATE - INTERVAL '30 days' THEN latest.remaining_debt ELSE 0 END,
    latest.visit_date
  FROM public.outlets o
  JOIN LATERAL (
    SELECT t.remaining_debt, t.visit_date, t.created_at
    FROM public.transactions t
    WHERE t.outlet_id = o.id
      AND t.user_id = _owner_id
    ORDER BY t.visit_date DESC, t.created_at DESC
    LIMIT 1
  ) latest ON true
  WHERE o.user_id = _owner_id
    AND COALESCE(latest.remaining_debt, 0) > 0
  ORDER BY latest.remaining_debt DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_outlet_ar_aging() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_outlet_ar_aging() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_outlet_ar_aging_v2(_owner_id uuid)
RETURNS TABLE (
  outlet_id uuid,
  outlet_name text,
  phone text,
  address text,
  total_debt numeric,
  current_0_7 numeric,
  aging_8_14 numeric,
  aging_15_30 numeric,
  over_30 numeric,
  last_transaction_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _resolved_owner_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  _resolved_owner_id := public.business_owner_id();
  IF _resolved_owner_id IS NULL OR _owner_id IS DISTINCT FROM _resolved_owner_id THEN
    RAISE EXCEPTION 'Akses bisnis tidak valid.';
  END IF;
  IF NOT public.business_has_premium_access(_resolved_owner_id) THEN
    RAISE EXCEPTION 'Laporan piutang tersedia pada paket Premium.';
  END IF;
  IF NOT public.is_business_owner() AND NOT public.has_team_permission('transactions') THEN
    RAISE EXCEPTION 'Tidak memiliki akses laporan piutang.';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.owner_phone,
    NULL::text,
    latest.remaining_debt::numeric,
    CASE WHEN latest.visit_date >= CURRENT_DATE - INTERVAL '7 days' THEN latest.remaining_debt ELSE 0 END,
    CASE WHEN latest.visit_date >= CURRENT_DATE - INTERVAL '14 days' AND latest.visit_date < CURRENT_DATE - INTERVAL '7 days' THEN latest.remaining_debt ELSE 0 END,
    CASE WHEN latest.visit_date >= CURRENT_DATE - INTERVAL '30 days' AND latest.visit_date < CURRENT_DATE - INTERVAL '14 days' THEN latest.remaining_debt ELSE 0 END,
    CASE WHEN latest.visit_date < CURRENT_DATE - INTERVAL '30 days' THEN latest.remaining_debt ELSE 0 END,
    latest.visit_date
  FROM public.outlets o
  JOIN LATERAL (
    SELECT t.remaining_debt, t.visit_date, t.created_at, t.id
    FROM public.transactions t
    WHERE t.outlet_id = o.id
      AND t.user_id = _resolved_owner_id
    ORDER BY t.visit_date DESC, t.created_at DESC, t.id DESC
    LIMIT 1
  ) latest ON true
  WHERE o.user_id = _resolved_owner_id
    AND latest.remaining_debt > 0
  ORDER BY latest.remaining_debt DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_outlet_ar_aging_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_outlet_ar_aging_v2(uuid) TO authenticated;

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
  IF NOT public.business_has_premium_access(_resolved_owner_id) THEN
    RAISE EXCEPTION 'Laporan piutang tersedia pada paket Premium.';
  END IF;
  IF NOT public.is_business_owner() AND NOT public.has_team_permission('transactions') THEN
    RAISE EXCEPTION 'Tidak memiliki akses piutang outlet.';
  END IF;

  RETURN QUERY
  WITH consignment_visits AS (
    SELECT t.id, t.outlet_id, t.visit_date, t.created_at, t.stock_scheme, t.line_items, t.new_consignment_items
    FROM public.transactions AS t
    WHERE t.user_id = _resolved_owner_id
      AND t.transaction_type = 'Consignment'
  ),
  active_visits AS (
    SELECT
      v.*,
      COALESCE((
        SELECT SUM(CASE WHEN v.stock_scheme = 'accumulation'
          THEN GREATEST(COALESCE((item->>'remaining')::numeric, 0), 0)
          ELSE 0 END)
        FROM jsonb_array_elements(COALESCE(v.line_items, '[]'::jsonb)) AS item
      ), 0)
      + COALESCE((
        SELECT SUM(GREATEST(COALESCE((item->>'qty')::numeric, 0), 0))
        FROM jsonb_array_elements(COALESCE(v.new_consignment_items, '[]'::jsonb)) AS item
      ), 0) AS active_qty
    FROM consignment_visits AS v
  ),
  selected AS (
    SELECT DISTINCT ON (av.outlet_id) av.*
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
      CASE WHEN s.stock_scheme = 'accumulation' THEN COALESCE(s.line_items, '[]'::jsonb) ELSE '[]'::jsonb END
    ) AS item
    UNION ALL
    SELECT
      s.outlet_id AS lv_outlet_id,
      s.visit_date AS lv_visit_date,
      GREATEST(COALESCE((item->>'qty')::numeric, 0), 0) AS qty,
      COALESCE((item->>'price')::numeric, 0) AS price,
      GREATEST(COALESCE((item->>'pcs_per_pack')::numeric, 1), 1) AS pcs_per_pack
    FROM selected AS s
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.new_consignment_items, '[]'::jsonb)) AS item
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
