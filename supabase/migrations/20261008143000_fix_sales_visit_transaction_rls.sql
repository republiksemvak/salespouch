-- Sales accounts must be able to record a store visit/invoice.
-- Permission settings may control other transaction management actions, but
-- recording the Sales user's own visit is a core field-sales operation.
DROP POLICY IF EXISTS "team records visits" ON public.transactions;

CREATE POLICY "team records visits"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = public.business_owner_id()
  AND (
    public.has_team_permission('transactions')
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.owner_id = public.business_owner_id()
        AND tm.position = 'sales'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.outlets o
    WHERE o.id = transactions.outlet_id
      AND o.user_id = public.business_owner_id()
  )
  AND (
    public.is_business_owner()
    OR sales_user_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
