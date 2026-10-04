-- Repair migration: ensure sales_expenses exists when the original migration
-- was not applied, then refresh the PostgREST schema cache.

CREATE TABLE IF NOT EXISTS public.sales_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sales_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (char_length(trim(category)) > 0),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  note text,
  spent_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_expenses_owner_id_idx ON public.sales_expenses(owner_id);
CREATE INDEX IF NOT EXISTS sales_expenses_sales_id_idx ON public.sales_expenses(sales_id);
CREATE INDEX IF NOT EXISTS sales_expenses_spent_at_idx ON public.sales_expenses(spent_at DESC);

GRANT SELECT, INSERT ON public.sales_expenses TO authenticated;
GRANT ALL ON public.sales_expenses TO service_role;
ALTER TABLE public.sales_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team reads sales expenses" ON public.sales_expenses;
DROP POLICY IF EXISTS "sales records own expenses" ON public.sales_expenses;

CREATE POLICY "team reads sales expenses"
ON public.sales_expenses
FOR SELECT TO authenticated
USING (
  owner_id = public.business_owner_id()
  AND (public.is_business_owner() OR sales_id = auth.uid())
);

CREATE POLICY "sales records own expenses"
ON public.sales_expenses
FOR INSERT TO authenticated
WITH CHECK (
  sales_id = auth.uid()
  AND owner_id = public.business_owner_id()
  AND NOT public.is_business_owner()
  AND EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid()
      AND owner_id = public.business_owner_id()
  )
);

NOTIFY pgrst, 'reload schema';
