-- Sales must be able to read back their own newly-created visit row.
-- This is required because visit.tsx inserts with .select("id").single(),
-- which applies SELECT RLS to the returned row.
DROP POLICY IF EXISTS "team reads transactions" ON public.transactions;

CREATE POLICY "team reads transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (
  user_id = public.business_owner_id()
  AND (
    public.is_business_owner()
    OR public.has_team_permission('transactions')
    OR sales_user_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
