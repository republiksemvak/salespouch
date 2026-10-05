-- Migration stock opening guard: warehouse first, then distributed outlet snapshot.
-- Migration outlet opening is a physical snapshot and MUST NOT reduce warehouse opening.
-- Sales is not an opening location in migration; Sales stock starts through operational load movements.

CREATE OR REPLACE FUNCTION public.validate_migration_opening_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setup_mode text;
  warehouse_location_id uuid;
  warehouse_has_opening boolean;
  target_location_type text;
BEGIN
  SELECT mode INTO setup_mode
  FROM public.stock_setups
  WHERE id = NEW.setup_id AND owner_id = NEW.owner_id;

  IF setup_mode IS NULL THEN
    RAISE EXCEPTION 'Stock setup tidak ditemukan atau bukan milik business ini';
  END IF;

  SELECT location_type INTO target_location_type
  FROM public.stock_locations
  WHERE id = NEW.location_id AND owner_id = NEW.owner_id AND is_active = true;

  IF target_location_type IS NULL THEN
    RAISE EXCEPTION 'Lokasi stok tidak ditemukan atau tidak aktif';
  END IF;

  IF setup_mode = 'migration' THEN
    IF target_location_type = 'sales' THEN
      RAISE EXCEPTION 'Migration opening tidak boleh diisi sebagai stok Sales. Stok Sales masuk melalui muatan operasional.';
    END IF;

    IF target_location_type <> 'warehouse' THEN
      SELECT id INTO warehouse_location_id
      FROM public.stock_locations
      WHERE owner_id = NEW.owner_id
        AND location_type = 'warehouse'
        AND is_active = true
      ORDER BY created_at
      LIMIT 1;

      IF warehouse_location_id IS NULL THEN
        RAISE EXCEPTION 'Selesaikan Stok Gudang terlebih dahulu sebelum mengisi stok Outlet.';
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.stock_opening_items soi
        WHERE soi.setup_id = NEW.setup_id
          AND soi.owner_id = NEW.owner_id
          AND soi.location_id = warehouse_location_id
          AND soi.quantity > 0
      ) INTO warehouse_has_opening;

      IF NOT warehouse_has_opening THEN
        RAISE EXCEPTION 'Selesaikan Stok Gudang terlebih dahulu sebelum mengisi stok Outlet.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_migration_opening_location_before_write ON public.stock_opening_items;
CREATE TRIGGER validate_migration_opening_location_before_write
BEFORE INSERT OR UPDATE ON public.stock_opening_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_migration_opening_location();

REVOKE ALL ON FUNCTION public.validate_migration_opening_location() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_migration_opening_location() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
