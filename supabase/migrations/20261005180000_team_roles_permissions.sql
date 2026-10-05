-- Team roles + Owner-managed permissions.
-- Owner remains the only authority that can change employee role/permissions.

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_position_check;

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_position_check
  CHECK (position IN ('admin', 'manager', 'sales'));

CREATE TABLE IF NOT EXISTS public.team_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS team_permissions_owner_user_idx
  ON public.team_permissions(owner_id, user_id);

CREATE INDEX IF NOT EXISTS team_permissions_key_idx
  ON public.team_permissions(permission_key);

ALTER TABLE public.team_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team permissions owner read" ON public.team_permissions;
CREATE POLICY "team permissions owner read"
ON public.team_permissions
FOR SELECT TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "team permissions owner insert" ON public.team_permissions;
CREATE POLICY "team permissions owner insert"
ON public.team_permissions
FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "team permissions owner update" ON public.team_permissions;
CREATE POLICY "team permissions owner update"
ON public.team_permissions
FOR UPDATE TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "team permissions owner delete" ON public.team_permissions;
CREATE POLICY "team permissions owner delete"
ON public.team_permissions
FOR DELETE TO authenticated
USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_owner_of_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = _user_id
      AND tm.owner_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.is_owner_of_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner_of_team_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_team_permission(_permission_key text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.team_permissions tp
      ON tp.owner_id = tm.owner_id
     AND tp.user_id = tm.user_id
     AND tp.permission_key = _permission_key
    WHERE tm.user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.has_team_permission(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_team_permission(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_team_member_role(
  _user_id uuid,
  _position text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat mengubah jabatan.';
  END IF;

  IF _position NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Jabatan tidak valid.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Anggota tim tidak ditemukan.';
  END IF;

  UPDATE public.team_members
  SET position = _position,
      manager_id = CASE WHEN _position = 'sales' THEN manager_id ELSE NULL END
  WHERE user_id = _user_id
    AND owner_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_member_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_member_role(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_team_permissions(
  _user_id uuid,
  _permission_keys text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat mengatur permission.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Anggota tim tidak ditemukan.';
  END IF;

  DELETE FROM public.team_permissions
  WHERE owner_id = auth.uid()
    AND user_id = _user_id;

  INSERT INTO public.team_permissions(owner_id, user_id, permission_key)
  SELECT auth.uid(), _user_id, key
  FROM unnest(COALESCE(_permission_keys, ARRAY[]::text[])) AS key
  WHERE trim(key) <> ''
  ON CONFLICT (owner_id, user_id, permission_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_team_permissions(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_team_permissions(uuid, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
