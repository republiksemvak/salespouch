-- Super Admin keeps full access for testing.
-- Regular Owners remain view-only; Sales can record their own expenses.

DROP POLICY IF EXISTS "sales records own expenses" ON public.sales_expenses;

CREATE POLICY "sales and super admin record expenses"
ON public.sales_expenses
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = public.business_owner_id()
  AND (
    (
      sales_id = auth.uid()
      AND NOT public.is_business_owner()
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
