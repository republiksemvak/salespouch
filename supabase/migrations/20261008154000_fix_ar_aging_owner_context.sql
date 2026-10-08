-- Fix AR Aging to use the business owner context rather than auth.uid()
-- for transaction ownership. This keeps report totals aligned with outlet debt
-- records created under the owner's user_id.
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  _owner_id := public.business_owner_id();
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan.';
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
    COALESCE(SUM(t.remaining_debt), 0)::numeric,
    COALESCE(SUM(CASE WHEN t.visit_date >= CURRENT_DATE - INTERVAL '7 days' THEN t.remaining_debt ELSE 0 END), 0)::numeric,
    COALESCE(SUM(CASE WHEN t.visit_date >= CURRENT_DATE - INTERVAL '14 days' AND t.visit_date < CURRENT_DATE - INTERVAL '7 days' THEN t.remaining_debt ELSE 0 END), 0)::numeric,
    COALESCE(SUM(CASE WHEN t.visit_date >= CURRENT_DATE - INTERVAL '30 days' AND t.visit_date < CURRENT_DATE - INTERVAL '14 days' THEN t.remaining_debt ELSE 0 END), 0)::numeric,
    COALESCE(SUM(CASE WHEN t.visit_date < CURRENT_DATE - INTERVAL '30 days' THEN t.remaining_debt ELSE 0 END), 0)::numeric,
    MAX(t.visit_date)
  FROM public.outlets o
  LEFT JOIN public.transactions t
    ON t.outlet_id = o.id
   AND t.user_id = _owner_id
   AND t.remaining_debt > 0
  WHERE o.user_id = _owner_id
  GROUP BY o.id, o.name, o.owner_phone
  HAVING COALESCE(SUM(t.remaining_debt), 0) > 0
  ORDER BY 5 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_outlet_ar_aging() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_outlet_ar_aging() TO authenticated;
NOTIFY pgrst, 'reload schema';
