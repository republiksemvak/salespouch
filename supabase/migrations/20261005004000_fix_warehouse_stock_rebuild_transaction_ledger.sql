-- Correct the warehouse stock bridge.
-- IMPORTANT: transaction ledger rows MUST be included in the warehouse rebuild.
-- apply_visit_stock mutates products.warehouse_stock immediately, but a later
-- Master Stock opening/movement edit may rebuild that balance. The rebuild must
-- therefore replay BOTH opening stock AND ALL warehouse-affecting movements,
-- including transaction movements, otherwise field sales are erased.

CREATE OR REPLACE FUNCTION public.rebuild_product_warehouse_stock(
  _owner_id uuid,
  _product_id uuid
)
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
  SELECT sl.id
  INTO warehouse_id
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
  )
  INTO has_foundation;

  -- Rebuild from the complete movement ledger.
  -- Transaction rows are intentionally INCLUDED:
  --   warehouse -> outlet  = stock leaves warehouse
  --   outlet -> warehouse   = stock returns to warehouse
  --   warehouse -> NULL     = direct sale leaves warehouse
  SELECT COALESCE(
    SUM(
      CASE
        WHEN sm.to_location_id = warehouse_id THEN sm.quantity
        ELSE 0
      END
      -
      CASE
        WHEN sm.from_location_id = warehouse_id THEN sm.quantity
        ELSE 0
      END
    ),
    0
  )
  INTO movement_net
  FROM public.stock_movements sm
  WHERE sm.owner_id = _owner_id
    AND sm.product_id = _product_id;

  IF has_foundation
     OR EXISTS (
       SELECT 1
       FROM public.stock_movements sm
       WHERE sm.owner_id = _owner_id
         AND sm.product_id = _product_id
     )
  THEN
    UPDATE public.products
    SET warehouse_stock = GREATEST(
      0,
      opening_qty + movement_net
    )
    WHERE user_id = _owner_id
      AND id = _product_id;
  END IF;
END;
$$;

-- Keep the existing INSERT/UPDATE/DELETE bridge, but make every affected
-- product rebuild against the complete ledger above.
CREATE OR REPLACE FUNCTION public.sync_manual_stock_movement_to_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.rebuild_product_warehouse_stock(
      OLD.owner_id,
      OLD.product_id
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Rebuild old product/owner first when the movement changed identity or
    -- warehouse effect, then rebuild the new product/owner.
    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id
       OR OLD.product_id IS DISTINCT FROM NEW.product_id
       OR OLD.from_location_id IS DISTINCT FROM NEW.from_location_id
       OR OLD.to_location_id IS DISTINCT FROM NEW.to_location_id
       OR OLD.quantity IS DISTINCT FROM NEW.quantity
       OR OLD.reference_type IS DISTINCT FROM NEW.reference_type
    THEN
      PERFORM public.rebuild_product_warehouse_stock(
        OLD.owner_id,
        OLD.product_id
      );
    END IF;

    PERFORM public.rebuild_product_warehouse_stock(
      NEW.owner_id,
      NEW.product_id
    );

    RETURN NEW;
  END IF;

  PERFORM public.rebuild_product_warehouse_stock(
    NEW.owner_id,
    NEW.product_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_manual_stock_movement_to_product_after_insert
ON public.stock_movements;

DROP TRIGGER IF EXISTS sync_manual_stock_movement_to_product_after_write
ON public.stock_movements;

CREATE TRIGGER sync_manual_stock_movement_to_product_after_write
AFTER INSERT OR UPDATE OR DELETE
ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.sync_manual_stock_movement_to_product();

-- Reconcile every product represented in the stock foundation.
DO $$
DECLARE
  row_data record;
BEGIN
  FOR row_data IN
    SELECT DISTINCT
      p.user_id AS owner_id,
      p.id AS product_id
    FROM public.products p
    WHERE EXISTS (
      SELECT 1
      FROM public.stock_opening_items soi
      JOIN public.stock_locations sl
        ON sl.id = soi.location_id
      WHERE soi.owner_id = p.user_id
        AND soi.product_id = p.id
        AND sl.location_type = 'warehouse'
    )
    OR EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.owner_id = p.user_id
        AND sm.product_id = p.id
    )
  LOOP
    PERFORM public.rebuild_product_warehouse_stock(
      row_data.owner_id,
      row_data.product_id
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
