-- Repair Sales expense category management + edit permissions for Lovable Cloud.

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.expense_categories
SET created_by = owner_id
WHERE created_by IS NULL;

ALTER TABLE public.expense_categories
  ALTER COLUMN created_by SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_owner_name_unique
  ON public.expense_categories(owner_id, name);

CREATE INDEX IF NOT EXISTS expense_categories_owner_id_idx
  ON public.expense_categories(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners manage expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "team reads expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "users manage own expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "business users read expense categories" ON public.expense_categories;

CREATE POLICY "users manage own expense categories"
ON public.expense_categories
FOR ALL TO authenticated
USING (
  created_by = auth.uid()
  AND owner_id = public.business_owner_id()
)
WITH CHECK (
  created_by = auth.uid()
  AND owner_id = public.business_owner_id()
);

CREATE POLICY "business users read expense categories"
ON public.expense_categories
FOR SELECT TO authenticated
USING (owner_id = public.business_owner_id());

GRANT UPDATE ON public.sales_expenses TO authenticated;

DROP POLICY IF EXISTS "sales update own expenses" ON public.sales_expenses;

CREATE POLICY "sales update own expenses"
ON public.sales_expenses
FOR UPDATE TO authenticated
USING (
  sales_id = auth.uid()
  AND owner_id = public.business_owner_id()
  AND NOT public.is_business_owner()
  AND EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid()
      AND owner_id = public.business_owner_id()
  )
)
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
