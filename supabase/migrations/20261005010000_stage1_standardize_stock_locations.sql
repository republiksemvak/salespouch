-- Stage 1: Standardize stock locations.
-- Goal: every business has one warehouse location, every outlet has one outlet location,
-- and every sales team member has one sales location.
-- This migration does NOT change stock quantities and does NOT move inventory.

CREATE OR REPLACE FUNCTION public.ensure_stock_location(
  _owner_id uuid,
  _location_type text,
  _name text,
  _outlet_id uuid DEFAULT NULL,
  _team_member_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  location_id uuid;
BEGIN
  IF _location_type = 'warehouse' THEN
    SELECT id INTO location_id
    FROM public.stock_locations
    WHERE owner_id = _owner_id
      AND location_type = 'warehouse'
    ORDER BY created_at
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name)
      VALUES (_owner_id, 'warehouse', COALESCE(NULLIF(trim(_name), ''), 'Gudang Utama'))
      RETURNING id INTO location_id;
    END IF;

  ELSIF _location_type = 'outlet' THEN
    SELECT id INTO location_id
    FROM public.stock_locations
    WHERE owner_id = _owner_id
      AND location_type = 'outlet'
      AND outlet_id = _outlet_id
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name, outlet_id)
      VALUES (_owner_id, 'outlet', COALESCE(NULLIF(trim(_name), ''), 'Outlet'), _outlet_id)
      RETURNING id INTO location_id;
    END IF;

  ELSIF _location_type = 'sales' THEN
    IF _team_member_user_id IS NULL THEN
      RAISE EXCEPTION 'Sales location requires team_member_user_id';
    END IF;

    SELECT id INTO location_id
    FROM public.stock_locations
    WHERE owner_id = _owner_id
      AND location_type = 'sales'
      AND team_member_user_id = _team_member_user_id
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(
        owner_id,
        location_type,
        name,
        team_member_user_id
      )
      VALUES (
        _owner_id,
        'sales',
        COALESCE(NULLIF(trim(_name), ''), 'Sales'),
        _team_member_user_id
      )
      RETURNING id INTO location_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported stock location type: %', _location_type;
  END IF;

  RETURN location_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_stock_location(uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_stock_location(uuid, text, text, uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Automatic location creation for outlets.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_outlet_stock_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_stock_location(
    NEW.user_id,
    'outlet',
    NEW.name,
    NEW.id,
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_outlet_stock_location_after_write
ON public.outlets;

CREATE TRIGGER sync_outlet_stock_location_after_write
AFTER INSERT ON public.outlets
FOR EACH ROW
EXECUTE FUNCTION public.sync_outlet_stock_location();

-- -----------------------------------------------------------------------------
-- Automatic location creation for sales team members.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_sales_stock_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sales_name text;
BEGIN
  SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), 'Sales')
  INTO sales_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  PERFORM public.ensure_stock_location(
    NEW.owner_id,
    'sales',
    sales_name,
    NULL,
    NEW.user_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_sales_stock_location_after_write
ON public.team_members;

CREATE TRIGGER sync_sales_stock_location_after_write
AFTER INSERT OR UPDATE OF owner_id, user_id ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.sync_sales_stock_location();

-- -----------------------------------------------------------------------------
-- Backfill locations for existing businesses, outlets and sales members.
-- This only creates missing location rows; it does not modify stock quantities.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.ensure_stock_location(r.id, 'warehouse', 'Gudang Utama');
  END LOOP;

  FOR r IN SELECT id, user_id, name FROM public.outlets LOOP
    PERFORM public.ensure_stock_location(r.user_id, 'outlet', r.name, r.id, NULL);
  END LOOP;

  FOR r IN
    SELECT tm.owner_id, tm.user_id,
           COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), 'Sales') AS sales_name
    FROM public.team_members tm
    LEFT JOIN public.profiles p ON p.id = tm.user_id
  LOOP
    PERFORM public.ensure_stock_location(
      r.owner_id,
      'sales',
      r.sales_name,
      NULL,
      r.user_id
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
