ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.expense_categories SET created_by = owner_id WHERE created_by IS NULL;
ALTER TABLE public.expense_categories ALTER COLUMN created_by SET NOT NULL;

DROP POLICY IF EXISTS "owners manage expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "team reads expense categories" ON public.expense_categories;

CREATE POLICY "users manage own expense categories"
ON public.expense_categories
FOR ALL TO authenticated
USING (created_by = auth.uid() AND owner_id = public.business_owner_id())
WITH CHECK (created_by = auth.uid() AND owner_id = public.business_owner_id());

CREATE POLICY "business users read expense categories"
ON public.expense_categories
FOR SELECT TO authenticated
USING (owner_id = public.business_owner_id());
