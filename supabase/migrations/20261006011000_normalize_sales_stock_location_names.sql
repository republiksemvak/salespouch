-- Normalize Sales stock-location names.
-- Sales locations must use the human-readable profile name, never a user-id prefix.
-- This changes labels only; stock quantities and movement history are untouched.

UPDATE public.stock_locations sl
SET name = COALESCE(
  NULLIF(trim(p.display_name), ''),
  NULLIF(trim(p.username), ''),
  'Sales'
)
FROM public.profiles p
WHERE sl.location_type = 'sales'
  AND sl.team_member_user_id = p.id
  AND COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), 'Sales') <> sl.name;

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
  resolved_sales_name text;
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

    SELECT COALESCE(
      NULLIF(trim(p.display_name), ''),
      NULLIF(trim(p.username), ''),
      NULLIF(trim(_name), ''),
      'Sales'
    )
    INTO resolved_sales_name
    FROM public.profiles p
    WHERE p.id = _team_member_user_id;

    resolved_sales_name := COALESCE(resolved_sales_name, NULLIF(trim(_name), ''), 'Sales');

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
        resolved_sales_name,
        _team_member_user_id
      )
      RETURNING id INTO location_id;
    ELSE
      UPDATE public.stock_locations
      SET name = resolved_sales_name
      WHERE id = location_id
        AND name IS DISTINCT FROM resolved_sales_name;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported stock location type: %', _location_type;
  END IF;

  RETURN location_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_stock_location(uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_stock_location(uuid, text, text, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
