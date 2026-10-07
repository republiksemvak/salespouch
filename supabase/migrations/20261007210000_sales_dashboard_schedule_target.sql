-- Update Sales dashboard financial summary:
-- scheduled_outlets_today = outlets assigned to this Sales for today's weekday.
-- scheduled_bill_target = current outstanding debt at those scheduled outlets.
-- collected_today = actual payments recorded today.

DROP FUNCTION IF EXISTS public.get_sales_dashboard_financial_summary(uuid, date);

CREATE OR REPLACE FUNCTION public.get_sales_dashboard_financial_summary(
  _sales_id uuid,
  _as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  owner_id uuid,
  sales_id uuid,
  as_of_date date,
  sales_value_today numeric,
  billed_today numeric,
  collected_today numeric,
  deposit_target numeric,
  travel_fund_in numeric,
  travel_fund_out numeric,
  travel_expense_out numeric,
  travel_balance numeric,
  scheduled_outlets_today bigint,
  scheduled_bill_target numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _sales_id <> auth.uid() AND NOT public.is_business_owner() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT
      _as_of_date::timestamptz AS start_at,
      (_as_of_date + 1)::timestamptz AS end_at
  ),
  scheduled AS (
    SELECT DISTINCT ss.outlet_id
    FROM public.store_schedules ss
    WHERE ss.owner_id = public.business_owner_id()
      AND ss.sales_id = _sales_id
      AND ss.day_of_week = EXTRACT(ISODOW FROM _as_of_date)::smallint
  ),
  scheduled_summary AS (
    SELECT
      COUNT(*)::bigint AS outlet_count,
      COALESCE(
        SUM(
          COALESCE(
            (
              SELECT t.remaining_debt
              FROM public.transactions t
              WHERE t.user_id = public.business_owner_id()
                AND t.sales_user_id = _sales_id
                AND t.outlet_id = s.outlet_id
              ORDER BY t.visit_date DESC, t.created_at DESC, t.id DESC
              LIMIT 1
            ),
            0
          )
        ),
        0
      ) AS bill_target
    FROM scheduled s
  ),
  tx_today AS (
    SELECT
      COALESCE(SUM(GREATEST(0, COALESCE(t.total_sales, 0) - COALESCE(t.discount_amount, 0))), 0) AS sales_value,
      COALESCE(SUM(GREATEST(0, COALESCE(t.total_due, 0))), 0) AS billed
    FROM public.transactions t
    CROSS JOIN bounds b
    WHERE t.user_id = public.business_owner_id()
      AND t.sales_user_id = _sales_id
      AND t.visit_date >= b.start_at
      AND t.visit_date < b.end_at
  ),
  collections_today AS (
    SELECT COALESCE(SUM(c.amount), 0) AS collected
    FROM public.sales_payment_collections c
    CROSS JOIN bounds b
    WHERE c.owner_id = public.business_owner_id()
      AND c.sales_id = _sales_id
      AND c.collected_at >= b.start_at
      AND c.collected_at < b.end_at
  ),
  funds AS (
    SELECT
      COALESCE(SUM(CASE WHEN f.transaction_type <> 'out' THEN f.amount ELSE 0 END), 0) AS fund_in,
      COALESCE(SUM(CASE WHEN f.transaction_type = 'out' THEN f.amount ELSE 0 END), 0) AS fund_out
    FROM public.sales_travel_funds f
    WHERE f.owner_id = public.business_owner_id()
      AND f.sales_id = _sales_id
      AND f.given_at <= _as_of_date
  ),
  expenses AS (
    SELECT COALESCE(SUM(e.amount), 0) AS expense_out
    FROM public.sales_expenses e
    WHERE e.owner_id = public.business_owner_id()
      AND e.sales_id = _sales_id
      AND e.spent_at <= _as_of_date
  )
  SELECT
    public.business_owner_id(),
    _sales_id,
    _as_of_date,
    tx_today.sales_value,
    tx_today.billed,
    collections_today.collected,
    collections_today.collected,
    funds.fund_in,
    funds.fund_out,
    expenses.expense_out,
    funds.fund_in - funds.fund_out - expenses.expense_out,
    scheduled_summary.outlet_count,
    scheduled_summary.bill_target
  FROM tx_today
  CROSS JOIN collections_today
  CROSS JOIN funds
  CROSS JOIN expenses
  CROSS JOIN scheduled_summary;
END;
$$;

REVOKE ALL
ON FUNCTION public.get_sales_dashboard_financial_summary(uuid, date)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.get_sales_dashboard_financial_summary(uuid, date)
TO authenticated;

NOTIFY pgrst, 'reload schema';
