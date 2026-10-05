-- Fix migration opening semantics.
--
-- Business rule:
-- 1. Opening stock is a physical snapshot at each location.
-- 2. In MIGRATION, warehouse 350 + outlet 20 means 370 physical opening stock.
-- 3. Outlet opening must NOT create a synthetic warehouse -> outlet transfer.
-- 4. Transfers begin only after the opening/cut-off is finalized.
--
-- The previous migration represented outlet opening as a warehouse -> outlet
-- transfer and excluded outlet opening from master_stock_global. That is wrong
-- for a migration snapshot because it makes already-distributed outlet stock
-- look like it came out of the warehouse during setup.

-- -----------------------------------------------------------------------------
-- 1. Remove synthetic outlet-opening movements created by the old rule.
-- -----------------------------------------------------------------------------
DELETE FROM public.stock_movements
WHERE reference_type = 'opening_stock';

DROP TRIGGER IF EXISTS sync_outlet_opening_stock_movement_after_write
ON public.stock_opening_items;

DROP FUNCTION IF EXISTS public.sync_outlet_opening_stock_movement();

-- -----------------------------------------------------------------------------
-- 2. Keep optional migration classification on outlet locations.
--
-- This is informational/business-state data used by the migration UI:
--   existing_stock = outlet already had physical stock before Sales Pouch
--   new_outlet     = outlet had no stock before Sales Pouch
--   unknown        = not classified yet
--
-- It does NOT alter the stock calculation. The quantity in
-- stock_opening_items is the physical opening snapshot.
-- -----------------------------------------------------------------------------
ALTER TABLE public.stock_locations
  ADD COLUMN IF NOT EXISTS migration_stock_state text;

ALTER TABLE public.stock_locations
  DROP CONSTRAINT IF EXISTS stock_locations_migration_stock_state_check;

ALTER TABLE public.stock_locations
  ADD CONSTRAINT stock_locations_migration_stock_state_check
  CHECK (
    migration_stock_state IS NULL
    OR migration_stock_state IN ('existing_stock', 'new_outlet', 'unknown')
  );

COMMENT ON COLUMN public.stock_locations.migration_stock_state IS
  'Migration-only outlet classification: existing_stock, new_outlet, or unknown. Informational; opening quantity remains the physical snapshot.';

-- -----------------------------------------------------------------------------
-- 3. Master Stock = opening snapshot + movements.
--
-- Every location contributes its own opening quantity. Therefore:
--   Warehouse 350 + Outlet 20 = 370
-- until a later stock movement changes either location.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.master_stock_global AS
WITH opening AS (
  SELECT
    soi.owner_id,
    soi.product_id,
    soi.location_id,
    SUM(soi.quantity) AS qty
  FROM public.stock_opening_items soi
  GROUP BY soi.owner_id, soi.product_id, soi.location_id
), movement_in AS (
  SELECT
    sm.owner_id,
    sm.product_id,
    sm.to_location_id AS location_id,
    SUM(sm.quantity) AS qty
  FROM public.stock_movements sm
  WHERE sm.to_location_id IS NOT NULL
  GROUP BY sm.owner_id, sm.product_id, sm.to_location_id
), movement_out AS (
  SELECT
    sm.owner_id,
    sm.product_id,
    sm.from_location_id AS location_id,
    SUM(sm.quantity) AS qty
  FROM public.stock_movements sm
  WHERE sm.from_location_id IS NOT NULL
  GROUP BY sm.owner_id, sm.product_id, sm.from_location_id
), balances AS (
  SELECT owner_id, product_id, location_id, qty FROM opening
  UNION ALL
  SELECT owner_id, product_id, location_id, qty FROM movement_in
  UNION ALL
  SELECT owner_id, product_id, location_id, -qty FROM movement_out
)
SELECT
  b.owner_id,
  b.product_id,
  p.name AS product_name,
  SUM(b.qty) AS global_quantity
FROM balances b
JOIN public.products p ON p.id = b.product_id
GROUP BY b.owner_id, b.product_id, p.name;

NOTIFY pgrst, 'reload schema';
