-- Allow Owner and authorized operational roles to record visits for a Sales user,
-- while still restricting Sales accounts to recording their own visits.
DROP POLICY IF EXISTS "team records visits" ON public.transactions;

CREATE POLICY "team records visits"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = public.business_owner_id()
  AND (
    public.is_business_owner()
    OR public.has_team_permission('transactions')
    OR sales_user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.outlets o
    WHERE o.id = transactions.outlet_id
      AND o.user_id = public.business_owner_id()
  )
  AND (
    sales_user_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = transactions.sales_user_id
        AND tm.owner_id = public.business_owner_id()
        AND tm.position = 'sales'
    )
  )
);

NOTIFY pgrst, 'reload schema';
