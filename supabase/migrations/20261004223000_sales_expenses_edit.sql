-- Sales may correct their own expense entries.
-- Owners remain view-only.

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
    SELECT 1
    FROM public.team_members
    WHERE user_id = auth.uid()
      AND owner_id = public.business_owner_id()
  )
)
WITH CHECK (
  sales_id = auth.uid()
  AND owner_id = public.business_owner_id()
  AND NOT public.is_business_owner()
  AND EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE user_id = auth.uid()
      AND owner_id = public.business_owner_id()
  )
);

NOTIFY pgrst, 'reload schema';
