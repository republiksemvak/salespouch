-- Harden the bridge between Master Stok and legacy products.warehouse_stock.
-- The field transaction path already mutates products.warehouse_stock directly.
-- Therefore transaction ledger rows must NEVER be included when rebuilding the
-- legacy warehouse balance, otherwise a later opening/movement edit would
-- double-count those transactions.

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
    AND sm.product_id = _product_id
    AND COALESCE(sm.reference_type, '') <> 'transaction';

  IF has_foundation OR EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.owner_id = _owner_id
      AND sm.product_id = _product_id
      AND COALESCE(sm.reference_type, '') <> 'transaction'
  ) THEN
    UPDATE public.products
       SET warehouse_stock = GREATEST(0, opening_qty + movement_net)
     WHERE user_id = _owner_id
       AND id = _product_id;
  END IF;
END;
$$;

-- Rebuild the affected legacy balance whenever a Master Stok movement changes.
-- This intentionally handles INSERT/UPDATE/DELETE instead of applying deltas,
-- so editing or deleting a movement cannot leave products.warehouse_stock stale.
CREATE OR REPLACE FUNCTION public.sync_manual_stock_movement_to_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_owner uuid;
  old_product uuid;
  new_owner uuid;
  new_product uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_owner := OLD.owner_id;
    old_product := OLD.product_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_owner := NEW.owner_id;
    new_product := NEW.product_id;
  END IF;

  -- Transaction rows are maintained by apply_visit_stock. They are excluded
  -- from the rebuild above, so no legacy balance update is needed here.
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.reference_type, '') = 'transaction' THEN
      RETURN OLD;
    END IF;
    PERFORM public.rebuild_product_warehouse_stock(old_owner, old_product);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.reference_type, '') <> 'transaction' THEN
      PERFORM public.rebuild_product_warehouse_stock(old_owner, old_product);
    END IF;
    IF COALESCE(NEW.reference_type, '') <> 'transaction'
       AND (new_owner IS DISTINCT FROM old_owner OR new_product IS DISTINCT FROM old_product
            OR NEW.from_location_id IS DISTINCT FROM OLD.from_location_id
            OR NEW.to_location_id IS DISTINCT FROM OLD.to_location_id
            OR NEW.quantity IS DISTINCT FROM OLD.quantity
            OR NEW.reference_type IS DISTINCT FROM OLD.reference_type) THEN
      PERFORM public.rebuild_product_warehouse_stock(new_owner, new_product);
    END IF;
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.reference_type, '') <> 'transaction' THEN
    PERFORM public.rebuild_product_warehouse_stock(new_owner, new_product);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_manual_stock_movement_to_product_after_insert
ON public.stock_movements;
DROP TRIGGER IF EXISTS sync_manual_stock_movement_to_product_after_write
ON public.stock_movements;

CREATE TRIGGER sync_manual_stock_movement_to_product_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.sync_manual_stock_movement_to_product();

-- If the previous bridge migration was already applied, reconcile all products
-- again using the corrected rule that excludes transaction ledger rows.
DO $$
DECLARE
  row_data record;
BEGIN
  FOR row_data IN
    SELECT DISTINCT p.user_id AS owner_id, p.id AS product_id
    FROM public.products p
    WHERE EXISTS (
      SELECT 1
      FROM public.stock_opening_items soi
      JOIN public.stock_locations sl ON sl.id = soi.location_id
      WHERE soi.owner_id = p.user_id
        AND soi.product_id = p.id
        AND sl.location_type = 'warehouse'
    )
    OR EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.owner_id = p.user_id
        AND sm.product_id = p.id
        AND COALESCE(sm.reference_type, '') <> 'transaction'
    )
  LOOP
    PERFORM public.rebuild_product_warehouse_stock(row_data.owner_id, row_data.product_id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
