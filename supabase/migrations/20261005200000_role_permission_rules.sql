-- Role/permission model:
-- Owner = authority over roles and permissions.
-- Admin = data/reporting/finance baseline.
-- Manager = people/HR and operations baseline.
-- Individual permissions may be granted by Owner as additional capability.

ALTER TABLE public.team_permissions
  DROP CONSTRAINT IF EXISTS team_permissions_permission_key_check;

ALTER TABLE public.team_permissions
  ADD CONSTRAINT team_permissions_permission_key_check
  CHECK (permission_key IN (
    'team', 'outlets', 'schedule', 'sales_stock', 'transactions',
    'operations', 'direct_selling', 'reports', 'kpi', 'travel_funds',
    'notes', 'payroll', 'products', 'master_stock', 'profile'
  ));

-- A permission check is only meaningful for the authenticated user itself,
-- unless the caller is the business Owner. This prevents arbitrary users from
-- probing another employee's permission state through the RPC.
CREATE OR REPLACE FUNCTION public.has_team_permission(_permission_key text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS DISTINCT FROM auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'owner'
      )
    THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.team_members tm
      JOIN public.team_permissions tp
        ON tp.owner_id = tm.owner_id
       AND tp.user_id = tm.user_id
       AND tp.permission_key = _permission_key
      WHERE tm.user_id = _user_id
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.has_team_permission(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_team_permission(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
