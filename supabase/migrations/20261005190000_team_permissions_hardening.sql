-- Team permission hardening.
-- Paste this migration manually into Lovable.dev / Supabase SQL Editor.
-- Owner is the only authority for role/permission management.

ALTER TABLE public.team_permissions
  DROP CONSTRAINT IF EXISTS team_permissions_permission_key_check;

ALTER TABLE public.team_permissions
  ADD CONSTRAINT team_permissions_permission_key_check
  CHECK (permission_key IN (
    'team',
    'outlets',
    'schedule',
    'sales_stock',
    'transactions',
    'operations',
    'direct_selling',
    'reports',
    'kpi',
    'travel_funds',
    'notes',
    'payroll',
    'products',
    'master_stock',
    'profile'
  ));

-- Seed the role baseline only for members that do not have explicit permissions yet.
-- This preserves any existing Owner customization.
INSERT INTO public.team_permissions (owner_id, user_id, permission_key)
SELECT
  tm.owner_id,
  tm.user_id,
  permission_key
FROM public.team_members tm
CROSS JOIN LATERAL unnest(
  CASE tm.position
    WHEN 'admin' THEN ARRAY[
      'outlets','transactions','reports','travel_funds','notes','payroll',
      'products','master_stock','profile'
    ]::text[]
    WHEN 'manager' THEN ARRAY[
      'team','outlets','schedule','sales_stock','transactions','operations',
      'direct_selling','travel_funds','notes','kpi','payroll'
    ]::text[]
    WHEN 'sales' THEN ARRAY[
      'outlets','schedule','sales_stock','transactions','travel_funds','notes'
    ]::text[]
    ELSE ARRAY[]::text[]
  END
) AS permission_key
WHERE NOT EXISTS (
  SELECT 1
  FROM public.team_permissions existing
  WHERE existing.owner_id = tm.owner_id
    AND existing.user_id = tm.user_id
)
ON CONFLICT (owner_id, user_id, permission_key) DO NOTHING;

-- Permission checks must not allow a non-owner to inspect another user's permissions.
-- Owner bypasses explicit permission rows because Owner is the highest authority.
CREATE OR REPLACE FUNCTION public.has_team_permission(
  _permission_key text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR auth.uid() IS NULL THEN false
    WHEN _user_id <> auth.uid() THEN false
    WHEN EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'owner'
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.team_members tm
      JOIN public.team_permissions tp
        ON tp.owner_id = tm.owner_id
       AND tp.user_id = tm.user_id
       AND tp.permission_key = _permission_key
      WHERE tm.user_id = auth.uid()
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.has_team_permission(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_team_permission(text, uuid) TO authenticated;

-- Atomic Owner operation: role + individual permissions are committed together.
CREATE OR REPLACE FUNCTION public.set_team_member_access(
  _user_id uuid,
  _position text,
  _permission_keys text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat mengatur jabatan dan permission.';
  END IF;

  IF _position NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Jabatan tidak valid.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE user_id = _user_id
      AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Anggota tim tidak ditemukan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(_permission_keys, ARRAY[]::text[])) AS requested(key)
    WHERE trim(requested.key) <> ''
      AND requested.key NOT IN (
        'team','outlets','schedule','sales_stock','transactions','operations',
        'direct_selling','reports','kpi','travel_funds','notes','payroll',
        'products','master_stock','profile'
      )
  ) THEN
    RAISE EXCEPTION 'Permission key tidak valid.';
  END IF;

  UPDATE public.team_members
  SET position = _position,
      manager_id = CASE WHEN _position = 'sales' THEN manager_id ELSE NULL END
  WHERE user_id = _user_id
    AND owner_id = auth.uid();

  DELETE FROM public.team_permissions
  WHERE owner_id = auth.uid()
    AND user_id = _user_id;

  INSERT INTO public.team_permissions(owner_id, user_id, permission_key)
  SELECT auth.uid(), _user_id, trim(requested.key)
  FROM unnest(COALESCE(_permission_keys, ARRAY[]::text[])) AS requested(key)
  WHERE trim(requested.key) <> ''
  ON CONFLICT (owner_id, user_id, permission_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_member_access(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_member_access(uuid, text, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
