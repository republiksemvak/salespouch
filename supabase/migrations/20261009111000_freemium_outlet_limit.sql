-- Freemium policy:
-- - Every account remains usable without a 24-hour trial.
-- - An active license_until means Premium; otherwise the business is Freemium.
-- - Freemium businesses may retain existing outlets but cannot add an 11th outlet.
-- - The trigger enforces the cap for every insert path, including direct Supabase inserts.
CREATE OR REPLACE FUNCTION public.enforce_freemium_outlet_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _license_until timestamptz;
  _email text;
  _outlet_count integer;
BEGIN
  -- Serialize inserts for this business to prevent concurrent requests exceeding the cap.
  SELECT p.license_until, p.user_email
    INTO _license_until, _email
  FROM public.profiles AS p
  WHERE p.id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil usaha tidak ditemukan.';
  END IF;

  IF lower(coalesce(_email, '')) IN (
    'candraprinting@gmail.com',
    'ganlapor@gmail.com',
    'republiksemvak@gmail.com'
  ) THEN
    RETURN NEW;
  END IF;

  IF _license_until IS NOT NULL AND _license_until > now() THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
    INTO _outlet_count
  FROM public.outlets AS o
  WHERE o.user_id = NEW.user_id;

  IF _outlet_count >= 10 THEN
    RAISE EXCEPTION 'Paket Gratis maksimal 10 outlet. Upgrade ke Premium untuk menambah outlet.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_freemium_outlet_limit_before_insert ON public.outlets;
CREATE TRIGGER enforce_freemium_outlet_limit_before_insert
BEFORE INSERT ON public.outlets
FOR EACH ROW
EXECUTE FUNCTION public.enforce_freemium_outlet_limit();

REVOKE ALL ON FUNCTION public.enforce_freemium_outlet_limit() FROM PUBLIC, anon, authenticated;
