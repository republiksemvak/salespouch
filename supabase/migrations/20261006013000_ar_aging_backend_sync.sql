-- SALES POUCH - AR AGING BACKEND SYNC
-- Tracks the AR Aging backend already applied to Supabase.

CREATE INDEX IF NOT EXISTS idx_transactions_ar_aging
ON public.transactions (
  user_id,
  outlet_id,
  remaining_debt,
  visit_date
)
WHERE remaining_debt > 0;

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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id AS outlet_id,
    o.name AS outlet_name,
    o.owner_phone AS phone,
    NULL::text AS address,
    COALESCE(SUM(t.remaining_debt), 0)::numeric AS total_debt,
    COALESCE(SUM(CASE WHEN t.visit_date >= CURRENT_DATE - INTERVAL '7 days' THEN t.remaining_debt ELSE 0 END), 0)::numeric AS current_0_7,
    COALESCE(SUM(CASE WHEN t.visit_date >= CURRENT_DATE - INTERVAL '14 days' AND t.visit_date < CURRENT_DATE - INTERVAL '7 days' THEN t.remaining_debt ELSE 0 END), 0)::numeric AS aging_8_14,
    COALESCE(SUM(CASE WHEN t.visit_date >= CURRENT_DATE - INTERVAL '30 days' AND t.visit_date < CURRENT_DATE - INTERVAL '14 days' THEN t.remaining_debt ELSE 0 END), 0)::numeric AS aging_15_30,
    COALESCE(SUM(CASE WHEN t.visit_date < CURRENT_DATE - INTERVAL '30 days' THEN t.remaining_debt ELSE 0 END), 0)::numeric AS over_30,
    MAX(t.visit_date) AS last_transaction_date
  FROM public.outlets o
  LEFT JOIN public.transactions t
    ON t.outlet_id = o.id
   AND t.user_id = auth.uid()
   AND t.remaining_debt > 0
  WHERE o.user_id = auth.uid()
  GROUP BY o.id, o.name, o.owner_phone
  HAVING COALESCE(SUM(t.remaining_debt), 0) > 0
  ORDER BY total_debt DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_outlet_ar_aging() TO authenticated;
NOTIFY pgrst, 'reload schema';
