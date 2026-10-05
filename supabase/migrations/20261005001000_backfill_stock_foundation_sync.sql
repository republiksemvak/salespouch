-- Backfill the synchronization introduced by 20261005000000.

-- Existing outlet openings entered through Master Stok must also be visible
-- to the first sales visit, which still reads outlet_opening_stock.
INSERT INTO public.outlet_opening_stock(user_id, outlet_id, product_id, quantity, opened_at)
SELECT
  soi.owner_id,
  sl.outlet_id,
  soi.product_id,
  soi.quantity,
  soi.counted_at
FROM public.stock_opening_items soi
JOIN public.stock_locations sl ON sl.id = soi.location_id
WHERE sl.location_type = 'outlet'
  AND sl.outlet_id IS NOT NULL
ON CONFLICT (outlet_id, product_id)
DO UPDATE SET
  user_id = EXCLUDED.user_id,
  quantity = EXCLUDED.quantity,
  opened_at = EXCLUDED.opened_at;

-- Existing transactions created after the stock foundation setup started
-- are physical stock movements too. Older transactions remain part of the
-- pre-foundation legacy balance and are intentionally not double-counted.
DO $$
DECLARE
  tx public.transactions%ROWTYPE;
BEGIN
  FOR tx IN
    SELECT t.*
    FROM public.transactions t
    JOIN public.stock_setups ss
      ON ss.owner_id = t.user_id
     AND t.created_at >= ss.started_at
  LOOP
    PERFORM public.sync_transaction_stock_movements();
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
