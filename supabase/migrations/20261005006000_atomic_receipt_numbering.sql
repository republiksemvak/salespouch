-- Atomic receipt numbering per business and receipt date.
-- The counter reserves a number before the transaction INSERT, so concurrent
-- sales cannot receive the same SP-YYYYMMDD-XXX number.

CREATE TABLE IF NOT EXISTS public.receipt_counters (
  owner_id uuid NOT NULL,
  receipt_date date NOT NULL,
  last_number integer NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  PRIMARY KEY (owner_id, receipt_date)
);

ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipt counters owner access"
ON public.receipt_counters;

CREATE POLICY "receipt counters owner access"
ON public.receipt_counters
FOR SELECT TO authenticated
USING (owner_id = public.business_owner_id());

-- Seed from existing receipts. This does not rewrite historical receipt numbers.
INSERT INTO public.receipt_counters(owner_id, receipt_date, last_number)
SELECT
  t.user_id,
  t.visit_date::date,
  COALESCE(
    MAX(
      CASE
        WHEN t.receipt_number ~ '[0-9]+$'
        THEN substring(t.receipt_number from '[0-9]+$')::integer
        ELSE 0
      END
    ),
    0
  )
FROM public.transactions t
WHERE t.receipt_number LIKE 'SP-%'
GROUP BY t.user_id, t.visit_date::date
ON CONFLICT (owner_id, receipt_date)
DO UPDATE SET
  last_number = GREATEST(
    public.receipt_counters.last_number,
    EXCLUDED.last_number
  );

CREATE OR REPLACE FUNCTION public.next_receipt_number(
  _receipt_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id_value uuid;
  next_number integer;
  prefix text;
BEGIN
  owner_id_value := public.business_owner_id();

  IF owner_id_value IS NULL THEN
    RAISE EXCEPTION 'Business owner not found';
  END IF;

  IF _receipt_date IS NULL THEN
    RAISE EXCEPTION 'Receipt date is required';
  END IF;

  prefix := 'SP-' || to_char(_receipt_date, 'YYYYMMDD') || '-';

  INSERT INTO public.receipt_counters(owner_id, receipt_date, last_number)
  VALUES (owner_id_value, _receipt_date, 0)
  ON CONFLICT (owner_id, receipt_date) DO NOTHING;

  UPDATE public.receipt_counters
  SET last_number = last_number + 1
  WHERE owner_id = owner_id_value
    AND receipt_date = _receipt_date
  RETURNING last_number INTO next_number;

  RETURN prefix || lpad(next_number::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_receipt_number(date)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.next_receipt_number(date)
TO authenticated;

NOTIFY pgrst, 'reload schema';
