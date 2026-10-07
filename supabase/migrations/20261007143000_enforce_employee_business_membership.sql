-- Enforce one business identity per employee account.
-- Owner accounts are standalone; employee accounts must remain linked to team_members.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'owner';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_type_check
  CHECK (account_type IN ('owner', 'employee'));

-- Existing team members are employees. This also repairs accounts created
-- before account_type was introduced.
UPDATE public.profiles p
SET account_type = 'employee'
WHERE EXISTS (
  SELECT 1
  FROM public.team_members tm
  WHERE tm.user_id = p.id
);

CREATE INDEX IF NOT EXISTS profiles_account_type_idx
  ON public.profiles(account_type);

-- An employee without a team_members row must never resolve itself as a business.
CREATE OR REPLACE FUNCTION public.business_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
    )
      THEN (
        SELECT tm.owner_id
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
        LIMIT 1
      )
    WHEN EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.account_type = 'owner'
    )
      THEN auth.uid()
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.business_owner_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_owner_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_business_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.account_type = 'owner'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_business_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_owner() TO authenticated;

NOTIFY pgrst, 'reload schema';
