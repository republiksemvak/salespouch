-- Stage 5: make the warehouse stock ledger an explicit runtime source.
-- Warehouse stock is derived from opening stock + movements at warehouse locations.
-- products.warehouse_stock remains legacy compatibility only.

CREATE OR REPLACE VIEW public.warehouse_stock_ledger
WITH (security_invoker = true)
AS
WITH opening AS (
  SELECT
    soi.owner_id,
    soi.product_id,
    SUM(soi.quantity) AS quantity
  FROM public.stock_opening_items soi
  JOIN public.stock_locations sl
    ON sl.id = soi.location_id
   AND sl.location_type = 'warehouse'
  GROUP BY soi.owner_id, soi.product_id
), movement_in AS (
  SELECT
    sm.owner_id,
    sm.product_id,
    SUM(sm.quantity) AS quantity
  FROM public.stock_movements sm
  JOIN public.stock_locations sl
    ON sl.id = sm.to_location_id
   AND sl.location_type = 'warehouse'
  GROUP BY sm.owner_id, sm.product_id
), movement_out AS (
  SELECT
    sm.owner_id,
    sm.product_id,
    SUM(sm.quantity) AS quantity
  FROM public.stock_movements sm
  JOIN public.stock_locations sl
    ON sl.id = sm.from_location_id
   AND sl.location_type = 'warehouse'
  GROUP BY sm.owner_id, sm.product_id
), balances AS (
  SELECT owner_id, product_id, quantity FROM opening
  UNION ALL
  SELECT owner_id, product_id, quantity FROM movement_in
  UNION ALL
  SELECT owner_id, product_id, -quantity FROM movement_out
)
SELECT
  p.user_id AS owner_id,
  p.id AS product_id,
  p.name AS product_name,
  GREATEST(0, COALESCE(SUM(b.quantity), 0)) AS warehouse_stock
FROM public.products p
LEFT JOIN balances b
  ON b.owner_id = p.user_id
 AND b.product_id = p.id
GROUP BY p.user_id, p.id, p.name;

GRANT SELECT ON public.warehouse_stock_ledger TO authenticated;
GRANT SELECT ON public.warehouse_stock_ledger TO service_role;

NOTIFY pgrst, 'reload schema';
