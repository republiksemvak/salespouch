-- Fix Sales expense INSERT RLS without querying team_members directly inside the policy.
-- business_owner_id() already resolves the authenticated Sales user's owner_id.
DROP POLICY IF EXISTS "sales and super admin record expenses" ON public.sales_expenses;
DROP POLICY IF EXISTS "sales records own expenses" ON public.sales_expenses;

CREATE POLICY "sales and super admin record expenses"
ON public.sales_expenses
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = public.business_owner_id()
  AND (
    sales_id = auth.uid()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'candraprinting@gmail.com',
      'ganlapor@gmail.com',
      'republiksemvak@gmail.com'
    )
  )
);

NOTIFY pgrst, 'reload schema';
