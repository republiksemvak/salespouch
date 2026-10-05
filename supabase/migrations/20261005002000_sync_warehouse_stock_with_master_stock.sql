-- Keep legacy products.warehouse_stock compatible with the Master Stok foundation.
-- The visit transaction path still uses products.warehouse_stock for fast validation,
-- while Master Stok remains the movement ledger.

CREATE OR REPLACE FUNCTION public.rebuild_product_warehouse_stock(_owner_id uuid, _product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  warehouse_id uuid;
  opening_qty numeric := 0;
  movement_net numeric := 0;
  has_foundation boolean := false;
BEGIN
  SELECT sl.id INTO warehouse_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = _owner_id
    AND sl.location_type = 'warehouse'
  ORDER BY sl.created_at
  LIMIT 1;

  IF warehouse_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(soi.quantity), 0)
    INTO opening_qty
  FROM public.stock_opening_items soi
  WHERE soi.owner_id = _owner_id
    AND soi.location_id = warehouse_id
    AND soi.product_id = _product_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.stock_opening_items soi
    WHERE soi.owner_id = _owner_id
      AND soi.location_id = warehouse_id
      AND soi.product_id = _product_id
  ) INTO has_foundation;

  SELECT COALESCE(SUM(
    CASE WHEN sm.to_location_id = warehouse_id THEN sm.quantity ELSE 0 END
    - CASE WHEN sm.from_location_id = warehouse_id THEN sm.quantity ELSE 0 END
  ), 0)
    INTO movement_net
  FROM public.stock_movements sm
  WHERE sm.owner_id = _owner_id
    AND sm.product_id = _product_id;

  -- Only replace the legacy balance when this product is represented by the
  -- Master Stok foundation. Products with no opening/movement foundation keep
  -- their legacy warehouse_stock untouched.
  IF has_foundation OR EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.owner_id = _owner_id
      AND sm.product_id = _product_id
  ) THEN
    UPDATE public.products
       SET warehouse_stock = GREATEST(0, opening_qty + movement_net)
     WHERE user_id = _owner_id
       AND id = _product_id;
  END IF;
END;
$$;

-- Master Stok warehouse opening becomes the same starting balance used by
-- the field transaction validator.
CREATE OR REPLACE FUNCTION public.sync_warehouse_opening_to_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  location_type_value text;
  warehouse_owner uuid;
  product_id_value uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT sl.location_type, sl.owner_id
      INTO location_type_value, warehouse_owner
    FROM public.stock_locations sl
    WHERE sl.id = OLD.location_id;
    product_id_value := OLD.product_id;

    IF location_type_value = 'warehouse' THEN
      PERFORM public.rebuild_product_warehouse_stock(warehouse_owner, product_id_value);
    END IF;
    RETURN OLD;
  END IF;

  SELECT sl.location_type, sl.owner_id
    INTO location_type_value, warehouse_owner
  FROM public.stock_locations sl
  WHERE sl.id = NEW.location_id;

  IF location_type_value = 'warehouse' THEN
    PERFORM public.rebuild_product_warehouse_stock(warehouse_owner, NEW.product_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_warehouse_opening_to_product_after_write
ON public.stock_opening_items;

CREATE TRIGGER sync_warehouse_opening_to_product_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.stock_opening_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_warehouse_opening_to_product();

-- Manual Master Stok movements (purchase, adjustment, transfer, etc.) must
-- also update the legacy field used by visit.tsx. Transaction movements are
-- excluded because apply_visit_stock already changes products.warehouse_stock.
CREATE OR REPLACE FUNCTION public.sync_manual_stock_movement_to_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  warehouse_id uuid;
  delta numeric := 0;
BEGIN
  IF COALESCE(NEW.reference_type, '') = 'transaction' THEN
    RETURN NEW;
  END IF;

  SELECT sl.id INTO warehouse_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = NEW.owner_id
    AND sl.location_type = 'warehouse'
  ORDER BY sl.created_at
  LIMIT 1;

  IF warehouse_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.to_location_id = warehouse_id THEN
    delta := delta + NEW.quantity;
  END IF;

  IF NEW.from_location_id = warehouse_id THEN
    delta := delta - NEW.quantity;
  END IF;

  IF delta <> 0 THEN
    UPDATE public.products
       SET warehouse_stock = GREATEST(0, warehouse_stock + delta)
     WHERE id = NEW.product_id
       AND user_id = NEW.owner_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_manual_stock_movement_to_product_after_insert
ON public.stock_movements;

CREATE TRIGGER sync_manual_stock_movement_to_product_after_insert
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.sync_manual_stock_movement_to_product();

-- Reconcile products for all products that already have a warehouse opening
-- or a movement in the new foundation. Transaction backfill movements are
-- already present, so this produces the correct final warehouse balance once.
DO $$
DECLARE
  row_data record;
BEGIN
  FOR row_data IN
    SELECT DISTINCT soi.owner_id, soi.product_id
    FROM public.stock_opening_items soi
    JOIN public.stock_locations sl ON sl.id = soi.location_id
    WHERE sl.location_type = 'warehouse'
    UNION
    SELECT DISTINCT sm.owner_id, sm.product_id
    FROM public.stock_movements sm
  LOOP
    PERFORM public.rebuild_product_warehouse_stock(row_data.owner_id, row_data.product_id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
