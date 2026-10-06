-- Stage 4: enforce stock movement business rules at the ledger boundary.
-- 1) Stok Distribusi (movement_type=production) may only enter a warehouse.
-- 2) Any movement leaving a location may not exceed that location's current balance.
-- 3) Non-null reference_type values must be known stock references.

CREATE OR REPLACE FUNCTION public.validate_stock_movement_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  product_owner uuid;
  from_owner uuid;
  to_owner uuid;
  reference_owner uuid;
BEGIN
  SELECT p.user_id INTO product_owner
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF product_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Produk stok bukan milik bisnis ini.';
  END IF;

  IF NEW.from_location_id IS NOT NULL THEN
    SELECT sl.owner_id INTO from_owner
    FROM public.stock_locations sl
    WHERE sl.id = NEW.from_location_id;

    IF from_owner IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Lokasi asal stok bukan milik bisnis ini.';
    END IF;
  END IF;

  IF NEW.to_location_id IS NOT NULL THEN
    SELECT sl.owner_id INTO to_owner
    FROM public.stock_locations sl
    WHERE sl.id = NEW.to_location_id;

    IF to_owner IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Lokasi tujuan stok bukan milik bisnis ini.';
    END IF;
  END IF;

  -- Stok Distribusi is an inbound warehouse movement, never a direct Sales/Outlet entry.
  IF NEW.movement_type = 'production' THEN
    IF NEW.from_location_id IS NOT NULL THEN
      RAISE EXCEPTION 'Stok Distribusi tidak boleh memiliki lokasi asal.';
    END IF;

    IF NEW.to_location_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.stock_locations sl
      WHERE sl.id = NEW.to_location_id
        AND sl.owner_id = NEW.owner_id
        AND sl.location_type = 'warehouse'
        AND sl.is_active = true
    ) THEN
      RAISE EXCEPTION 'Stok Distribusi hanya boleh masuk ke Gudang.';
    END IF;
  END IF;

  IF NEW.reference_id IS NOT NULL THEN
    IF NEW.reference_type = 'transaction' THEN
      SELECT t.user_id INTO reference_owner
      FROM public.transactions t
      WHERE t.id = NEW.reference_id;
    ELSIF NEW.reference_type = 'warehouse_direct_sale' THEN
      SELECT wds.owner_id INTO reference_owner
      FROM public.warehouse_direct_sales wds
      WHERE wds.id = NEW.reference_id;
    ELSIF NEW.reference_type = 'opening_stock' THEN
      SELECT soi.owner_id INTO reference_owner
      FROM public.stock_opening_items soi
      WHERE soi.id = NEW.reference_id;
    ELSIF NEW.reference_type IN ('sales_stock_day_load', 'sales_stock_day_close') THEN
      SELECT ssd.owner_id INTO reference_owner
      FROM public.sales_stock_days ssd
      WHERE ssd.id = NEW.reference_id;
    ELSIF NEW.reference_type = 'production' THEN
      reference_owner := NEW.owner_id;
    ELSE
      RAISE EXCEPTION 'Tipe referensi stok tidak dikenal: %.', NEW.reference_type;
    END IF;

    IF reference_owner IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Referensi pergerakan stok bukan milik bisnis ini.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_stock_movement_source_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  balance numeric;
BEGIN
  IF NEW.from_location_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize all outgoing movements for this product before checking the balance.
  PERFORM public.lock_stock_product(NEW.owner_id, NEW.product_id);

  balance := COALESCE((
    SELECT SUM(soi.quantity)
    FROM public.stock_opening_items soi
    WHERE soi.owner_id = NEW.owner_id
      AND soi.location_id = NEW.from_location_id
      AND soi.product_id = NEW.product_id
  ), 0)
  + COALESCE((
    SELECT SUM(sm.quantity)
    FROM public.stock_movements sm
    WHERE sm.owner_id = NEW.owner_id
      AND sm.to_location_id = NEW.from_location_id
      AND sm.product_id = NEW.product_id
      AND (TG_OP = 'INSERT' OR sm.id <> OLD.id)
  ), 0)
  - COALESCE((
    SELECT SUM(sm.quantity)
    FROM public.stock_movements sm
    WHERE sm.owner_id = NEW.owner_id
      AND sm.from_location_id = NEW.from_location_id
      AND sm.product_id = NEW.product_id
      AND (TG_OP = 'INSERT' OR sm.id <> OLD.id)
  ), 0);

  IF balance < NEW.quantity THEN
    RAISE EXCEPTION 'Stok sumber tidak cukup. Tersedia %, diminta %.', balance, NEW.quantity;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_stock_movement_source_balance_before_write
ON public.stock_movements;

CREATE TRIGGER validate_stock_movement_source_balance_before_write
BEFORE INSERT OR UPDATE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.validate_stock_movement_source_balance();

NOTIFY pgrst, 'reload schema';
