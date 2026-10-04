-- Team hierarchy: Owner -> Manager -> Sales.
-- Manager is an employee role inside the Owner's business, not a separate business/license.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS position text NOT NULL DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS manager_id uuid NULL;

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_position_check;
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_position_check CHECK (position IN ('manager', 'sales'));

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_manager_id_fkey;
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES public.team_members(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_members_owner_id_idx ON public.team_members(owner_id);
CREATE INDEX IF NOT EXISTS team_members_manager_id_idx ON public.team_members(manager_id);
CREATE INDEX IF NOT EXISTS team_members_position_idx ON public.team_members(position);

CREATE OR REPLACE FUNCTION public.validate_team_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE manager_row public.team_members%ROWTYPE;
BEGIN
  IF NEW.position = 'manager' AND NEW.manager_id IS NOT NULL THEN
    RAISE EXCEPTION 'Manager tidak boleh berada di bawah Manager lain.';
  END IF;

  IF NEW.position = 'sales' AND NEW.manager_id IS NOT NULL THEN
    SELECT * INTO manager_row
    FROM public.team_members
    WHERE user_id = NEW.manager_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Manager tidak ditemukan.';
    END IF;

    IF manager_row.owner_id <> NEW.owner_id THEN
      RAISE EXCEPTION 'Manager harus berasal dari bisnis yang sama.';
    END IF;

    IF manager_row.position <> 'manager' THEN
      RAISE EXCEPTION 'Sales hanya dapat ditempatkan di bawah Manager.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_team_hierarchy_before_write ON public.team_members;
CREATE TRIGGER validate_team_hierarchy_before_write
BEFORE INSERT OR UPDATE OF owner_id, position, manager_id
ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.validate_team_hierarchy();

DROP POLICY IF EXISTS "owner reads team" ON public.team_members;
CREATE POLICY "business users read team"
ON public.team_members
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR user_id = auth.uid()
  OR manager_id = auth.uid()
);

CREATE OR REPLACE FUNCTION public.is_business_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE user_id = auth.uid()
      AND position = 'manager'
  );
$$;

REVOKE ALL ON FUNCTION public.is_business_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_manager() TO authenticated;

NOTIFY pgrst, 'reload schema';
