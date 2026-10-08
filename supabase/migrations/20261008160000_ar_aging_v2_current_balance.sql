-- AR Aging v2: current outlet balance, not historical sum.
-- The caller must belong to the same business as _owner_id.
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
NOTIFY pgrst, 'reload schema';
