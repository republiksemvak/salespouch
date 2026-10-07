-- Sales dashboard financial logic:
-- 1) Capture every change to transactions.amount_paid as a payment collection ledger.
-- 2) Provide one secure RPC for the Sales dashboard.
-- Existing first-time payments are backfilled from the transaction visit date.
--
-- The ledger is the source for "uang yang benar-benar diterima Sales".
-- When an old invoice is paid later, the UPDATE delta is recorded with now(),
-- so today's collection is not incorrectly attached to the old visit date.

CREATE TABLE IF NOT EXISTS public.sales_payment_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sales_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount <> 0),
  collection_type text NOT NULL DEFAULT 'payment'
    CHECK (collection_type IN ('payment', 'adjustment')),
  collected_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_payment_collections_sales_date_idx
  ON public.sales_payment_collections(sales_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS sales_payment_collections_owner_date_idx
  ON public.sales_payment_collections(owner_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS sales_payment_collections_transaction_idx
  ON public.sales_payment_collections(transaction_id);

GRANT SELECT ON public.sales_payment_collections TO authenticated;
GRANT ALL ON public.sales_payment_collections TO service_role;

ALTER TABLE public.sales_payment_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales read own payment collections" ON public.sales_payment_collections;
CREATE POLICY "sales read own payment collections"
ON public.sales_payment_collections
FOR SELECT TO authenticated
USING (
  owner_id = public.business_owner_id()
  AND (
    public.is_business_owner()
    OR sales_id = auth.uid()
  )
);

-- Backfill the currently stored payment state once.
-- Historical records do not contain a payment date, so their visit_date is
-- the only reliable existing timestamp available.
INSERT INTO public.sales_payment_collections (
  owner_id,
  sales_id,
  transaction_id,
  amount,
  collection_type,
  collected_at,
  note
)
SELECT
  t.user_id,
  t.sales_user_id,
  t.id,
  t.amount_paid,
  'payment',
  COALESCE(t.visit_date, t.created_at),
  'Backfill pembayaran dari transaksi lama'
FROM public.transactions t
WHERE t.sales_user_id IS NOT NULL
  AND COALESCE(t.amount_paid, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.sales_payment_collections c
    WHERE c.transaction_id = t.id
  );

CREATE OR REPLACE FUNCTION public.sync_sales_payment_collection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  delta numeric(14,2);
BEGIN
  IF NEW.sales_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    delta := COALESCE(NEW.amount_paid, 0);
    IF delta <> 0 THEN
      INSERT INTO public.sales_payment_collections (
        owner_id,
        sales_id,
        transaction_id,
        amount,
        collection_type,
        collected_at,
        note
      )
      VALUES (
        NEW.user_id,
        NEW.sales_user_id,
        NEW.id,
        delta,
        'payment',
        COALESCE(NEW.visit_date, now()),
        'Pembayaran saat transaksi dibuat'
      );
    END IF;
    RETURN NEW;
  END IF;

  delta := COALESCE(NEW.amount_paid, 0) - COALESCE(OLD.amount_paid, 0);

  IF delta <> 0 THEN
    INSERT INTO public.sales_payment_collections (
      owner_id,
      sales_id,
      transaction_id,
      amount,
      collection_type,
      collected_at,
      note
    )
    VALUES (
      NEW.user_id,
      NEW.sales_user_id,
      NEW.id,
      delta,
      CASE WHEN delta > 0 THEN 'payment' ELSE 'adjustment' END,
      now(),
      CASE
        WHEN delta > 0 THEN 'Pembayaran/tagihan masuk'
        ELSE 'Penyesuaian pembayaran'
      END
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_sales_payment_collection() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_sales_payment_collection() TO authenticated;

DROP TRIGGER IF EXISTS sync_sales_payment_collection_after_write
ON public.transactions;

CREATE TRIGGER sync_sales_payment_collection_after_write
AFTER INSERT OR UPDATE OF amount_paid
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_sales_payment_collection();

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
  travel_balance numeric
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
    funds.fund_in - funds.fund_out - expenses.expense_out
  FROM tx_today, collections_today, funds, expenses;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_dashboard_financial_summary(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard_financial_summary(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
