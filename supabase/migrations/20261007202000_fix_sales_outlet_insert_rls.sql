-- Allow Owner/Admin/Manager/Sales to create an outlet inside their own business.
-- The check is based on the authenticated user's real team membership,
-- not on the client-supplied owner_id alone.

CREATE OR REPLACE FUNCTION public.can_manage_outlet_owner(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.id = _owner_id
        AND p.account_type = 'owner'
    )
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.owner_id = _owner_id
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_outlet_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_outlet_owner(uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlets TO authenticated;

DROP POLICY IF EXISTS "own outlets" ON public.outlets;
DROP POLICY IF EXISTS "team reads outlets" ON public.outlets;
DROP POLICY IF EXISTS "team adds outlets" ON public.outlets;
DROP POLICY IF EXISTS "owner edits outlets" ON public.outlets;
DROP POLICY IF EXISTS "owner deletes outlets" ON public.outlets;

CREATE POLICY "business members read outlets"
ON public.outlets
FOR SELECT TO authenticated
USING (public.can_manage_outlet_owner(user_id));

CREATE POLICY "business members add outlets"
ON public.outlets
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_outlet_owner(user_id));

CREATE POLICY "business owner edits outlets"
ON public.outlets
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.is_business_owner())
WITH CHECK (user_id = auth.uid() AND public.is_business_owner());

CREATE POLICY "business owner deletes outlets"
ON public.outlets
FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.is_business_owner());

NOTIFY pgrst, 'reload schema';
