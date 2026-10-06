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
AS $function$
DECLARE
  location_id uuid;
  resolved_name text;
BEGIN
  IF _location_type = 'warehouse' THEN
    resolved_name := COALESCE(NULLIF(trim(_name), ''), 'Gudang Utama');
    SELECT id INTO location_id
    FROM public.stock_locations
    WHERE owner_id = _owner_id AND location_type = 'warehouse'
    ORDER BY created_at
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name)
      VALUES (_owner_id, 'warehouse', resolved_name)
      RETURNING id INTO location_id;
    ELSE
      UPDATE public.stock_locations SET name = resolved_name, is_active = true WHERE id = location_id;
    END IF;
  ELSIF _location_type = 'outlet' THEN
    resolved_name := COALESCE(NULLIF(trim(_name), ''), 'Outlet');
    SELECT id INTO location_id
    FROM public.stock_locations
    WHERE owner_id = _owner_id AND location_type = 'outlet' AND outlet_id = _outlet_id
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name, outlet_id)
      VALUES (_owner_id, 'outlet', resolved_name, _outlet_id)
      RETURNING id INTO location_id;
    ELSE
      UPDATE public.stock_locations SET name = resolved_name, is_active = true WHERE id = location_id;
    END IF;
  ELSIF _location_type = 'sales' THEN
    IF _team_member_user_id IS NULL THEN
      RAISE EXCEPTION 'Sales location requires team_member_user_id';
    END IF;

    SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), NULLIF(trim(_name), ''), 'Sales')
    INTO resolved_name
    FROM public.profiles p
    WHERE p.id = _team_member_user_id;
    resolved_name := COALESCE(resolved_name, NULLIF(trim(_name), ''), 'Sales');

    SELECT id INTO location_id
    FROM public.stock_locations
    WHERE owner_id = _owner_id AND location_type = 'sales' AND team_member_user_id = _team_member_user_id
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name, team_member_user_id)
      VALUES (_owner_id, 'sales', resolved_name, _team_member_user_id)
      RETURNING id INTO location_id;
    ELSE
      UPDATE public.stock_locations SET name = resolved_name, is_active = true WHERE id = location_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported stock location type: %', _location_type;
  END IF;

  RETURN location_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_sales_stock_location_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  member record;
BEGIN
  FOR member IN
    SELECT tm.owner_id, tm.user_id
    FROM public.team_members tm
    WHERE tm.user_id = NEW.id
  LOOP
    PERFORM public.ensure_stock_location(member.owner_id, 'sales', COALESCE(NULLIF(trim(NEW.display_name), ''), NULLIF(trim(NEW.username), ''), 'Sales'), NULL, member.user_id);
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_sales_stock_location_name_after_profile_update ON public.profiles;
CREATE TRIGGER sync_sales_stock_location_name_after_profile_update
AFTER UPDATE OF display_name, username ON public.profiles
FOR EACH ROW
WHEN (OLD.display_name IS DISTINCT FROM NEW.display_name OR OLD.username IS DISTINCT FROM NEW.username)
EXECUTE FUNCTION public.sync_sales_stock_location_name();

CREATE OR REPLACE FUNCTION public.sync_outlet_stock_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.ensure_stock_location(NEW.user_id, 'outlet', NEW.name, NEW.id, NULL);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_outlet_stock_location_after_write ON public.outlets;
CREATE TRIGGER sync_outlet_stock_location_after_write
AFTER INSERT OR UPDATE OF name ON public.outlets
FOR EACH ROW
EXECUTE FUNCTION public.sync_outlet_stock_location();

CREATE OR REPLACE FUNCTION public.record_physical_opening_snapshot(
  _location_id uuid,
  _product_id uuid,
  _physical_quantity numeric,
  _counted_at timestamptz DEFAULT now(),
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  owner_id uuid;
  location_type text;
  current_quantity numeric;
  delta numeric;
  movement_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Anda harus masuk untuk mencatat stok awal.';
  END IF;
  owner_id := auth.uid();
  IF _physical_quantity IS NULL OR _physical_quantity < 0 OR trunc(_physical_quantity) <> _physical_quantity THEN
    RAISE EXCEPTION 'Jumlah fisik harus berupa pcs bulat dan tidak boleh negatif.';
  END IF;
  IF length(COALESCE(_note, '')) > 250 THEN
    RAISE EXCEPTION 'Catatan maksimal 250 karakter.';
  END IF;

  SELECT sl.location_type INTO location_type
  FROM public.stock_locations sl
  WHERE sl.id = _location_id AND sl.owner_id = owner_id AND sl.is_active = true
  FOR UPDATE;
  IF location_type IS NULL THEN
    RAISE EXCEPTION 'Lokasi stok tidak ditemukan atau bukan milik bisnis ini.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = _product_id AND p.user_id = owner_id) THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau bukan milik bisnis ini.';
  END IF;

  SELECT COALESCE(SUM(x.quantity), 0) INTO current_quantity
  FROM (
    SELECT CASE WHEN location_type <> 'outlet' THEN soi.quantity ELSE 0 END AS quantity
    FROM public.stock_opening_items soi
    WHERE soi.owner_id = owner_id AND soi.location_id = _location_id AND soi.product_id = _product_id
    UNION ALL
    SELECT sm.quantity
    FROM public.stock_movements sm
    WHERE sm.owner_id = owner_id AND sm.product_id = _product_id AND sm.to_location_id = _location_id
    UNION ALL
    SELECT -sm.quantity
    FROM public.stock_movements sm
    WHERE sm.owner_id = owner_id AND sm.product_id = _product_id AND sm.from_location_id = _location_id
  ) x;

  delta := _physical_quantity - current_quantity;
  IF delta = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.stock_movements(
    owner_id, product_id, movement_type, from_location_id, to_location_id,
    quantity, reference_type, reference_id, notes, occurred_at
  ) VALUES (
    owner_id, _product_id,
    CASE WHEN delta > 0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
    CASE WHEN delta < 0 THEN _location_id ELSE NULL END,
    CASE WHEN delta > 0 THEN _location_id ELSE NULL END,
    abs(delta), 'physical_opening_snapshot', gen_random_uuid(),
    COALESCE(NULLIF(trim(_note), ''), 'Input Stok Awal fisik'), COALESCE(_counted_at, now())
  ) RETURNING id INTO movement_id;

  RETURN movement_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_physical_opening_snapshot(uuid, uuid, numeric, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_physical_opening_snapshot(uuid, uuid, numeric, timestamptz, text) TO authenticated, service_role;

UPDATE public.stock_locations sl
SET name = COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), 'Sales')
FROM public.profiles p
WHERE sl.location_type = 'sales'
  AND sl.team_member_user_id = p.id
  AND sl.name IS DISTINCT FROM COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(p.username), ''), 'Sales');

UPDATE public.stock_locations sl
SET name = o.name
FROM public.outlets o
WHERE sl.location_type = 'outlet'
  AND sl.outlet_id = o.id
  AND sl.name IS DISTINCT FROM o.name;

NOTIFY pgrst, 'reload schema';