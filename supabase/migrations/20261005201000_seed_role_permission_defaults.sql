-- Seed the role baseline once for existing team members that do not yet
-- have explicit Owner-managed permissions. Future members are seeded by the
-- trigger below. Owner can still replace the permissions at any time.

INSERT INTO public.team_permissions(owner_id, user_id, permission_key)
SELECT tm.owner_id, tm.user_id, permission_key
FROM public.team_members tm
CROSS JOIN LATERAL (
  SELECT unnest(
    CASE tm.position
      WHEN 'admin' THEN ARRAY['outlets','transactions','reports','travel_funds','notes','payroll','products','master_stock','profile']::text[]
      WHEN 'manager' THEN ARRAY['team','outlets','schedule','sales_stock','transactions','operations','direct_selling','travel_funds','notes','kpi','payroll']::text[]
      WHEN 'sales' THEN ARRAY['outlets','schedule','sales_stock','transactions','travel_funds','notes']::text[]
    END
  ) AS permission_key
) defaults
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_permissions existing
  WHERE existing.owner_id = tm.owner_id
    AND existing.user_id = tm.user_id
);

CREATE OR REPLACE FUNCTION public.seed_team_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.position = 'admin' THEN
    INSERT INTO public.team_permissions(owner_id, user_id, permission_key)
    SELECT NEW.owner_id, NEW.user_id, unnest(ARRAY['outlets','transactions','reports','travel_funds','notes','payroll','products','master_stock','profile']::text[])
    ON CONFLICT (owner_id, user_id, permission_key) DO NOTHING;
  ELSIF NEW.position = 'manager' THEN
    INSERT INTO public.team_permissions(owner_id, user_id, permission_key)
    SELECT NEW.owner_id, NEW.user_id, unnest(ARRAY['team','outlets','schedule','sales_stock','transactions','operations','direct_selling','travel_funds','notes','kpi','payroll']::text[])
    ON CONFLICT (owner_id, user_id, permission_key) DO NOTHING;
  ELSIF NEW.position = 'sales' THEN
    INSERT INTO public.team_permissions(owner_id, user_id, permission_key)
    SELECT NEW.owner_id, NEW.user_id, unnest(ARRAY['outlets','schedule','sales_stock','transactions','travel_funds','notes']::text[])
    ON CONFLICT (owner_id, user_id, permission_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_team_role_permissions_after_insert ON public.team_members;
CREATE TRIGGER seed_team_role_permissions_after_insert
AFTER INSERT ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.seed_team_role_permissions();

REVOKE ALL ON FUNCTION public.seed_team_role_permissions() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
