-- Grant the intended Super Admin account the database admin role.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE lower(email) = 'republiksemvak@gmail.com'
ON CONFLICT DO NOTHING;

-- Keep future registrations for all intended Super Admin emails on the admin role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT DO NOTHING;

  IF lower(NEW.email) IN (
    'candraprinting@gmail.com',
    'ganlapor@gmail.com',
    'republiksemvak@gmail.com'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
