-- Fast Owner dashboard summary: aggregate on the database instead of
-- transferring today's transaction rows to the browser.
CREATE OR REPLACE FUNCTION public.get_owner_dashboard_summary(
  _owner_id uuid,
  _as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  omzet numeric,
  transactions bigint,
  visited bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _start_at timestamptz := _as_of_date::timestamptz;
  _end_at timestamptz := (_as_of_date + 1)::timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF _owner_id IS DISTINCT FROM public.business_owner_id()
     OR NOT public.is_business_owner() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH field AS (
    SELECT
      COALESCE(SUM(GREATEST(0, COALESCE(t.total_sales, 0) - COALESCE(t.discount_amount, 0))), 0) AS omzet,
      COUNT(*)::bigint AS transaction_count,
      COUNT(DISTINCT t.outlet_id)::bigint AS visited
    FROM public.transactions t
    WHERE t.user_id = _owner_id
      AND t.visit_date >= _start_at
      AND t.visit_date < _end_at
  ),
  warehouse AS (
    SELECT
      COALESCE(SUM(GREATEST(0, COALESCE(w.total_sales, 0) - COALESCE(w.discount_amount, 0))), 0) AS omzet,
      COUNT(*)::bigint AS transaction_count
    FROM public.warehouse_direct_sales w
    WHERE w.owner_id = _owner_id
      AND w.sale_date >= _start_at
      AND w.sale_date < _end_at
  )
  SELECT
    field.omzet + warehouse.omzet,
    field.transaction_count + warehouse.transaction_count,
    field.visited
  FROM field, warehouse;
END;
$$;

REVOKE ALL ON FUNCTION public.get_owner_dashboard_summary(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_dashboard_summary(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
