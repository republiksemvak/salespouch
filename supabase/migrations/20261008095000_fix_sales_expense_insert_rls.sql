-- Repair Sales expense INSERT RLS.
-- Sales must be able to create their own expense rows within their business.
-- Keep the check scoped to auth.uid() and team membership; do not depend on
-- is_business_owner(), which can reject valid Sales sessions.

DROP POLICY IF EXISTS "sales and super admin record expenses" ON public.sales_expenses;
DROP POLICY IF EXISTS "sales records own expenses" ON public.sales_expenses;

CREATE POLICY "sales and super admin record expenses"
ON public.sales_expenses
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = public.business_owner_id()
  AND (
    (
      sales_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.team_members
        WHERE user_id = auth.uid()
          AND owner_id = public.business_owner_id()
      )
    )
    OR lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'candraprinting@gmail.com',
      'ganlapor@gmail.com',
      'republiksemvak@gmail.com'
    )
  )
);

NOTIFY pgrst, 'reload schema';
