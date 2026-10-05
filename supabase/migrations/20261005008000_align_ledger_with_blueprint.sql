-- Align the stock foundation with the Sales Pouch blueprint.
-- 1) Backfill historical transaction movements that are missing from the ledger.
-- 2) Treat outlet opening stock as a physical warehouse -> outlet transfer.
-- 3) Keep warehouse opening as the opening balance; outlet opening is no longer
--    counted as an independent opening balance in master_stock_global.

-- -----------------------------------------------------------------------------
-- 1. Historical transaction ledger backfill
-- -----------------------------------------------------------------------------
-- Existing transaction rows may predate the stock-movement trigger. Recreate the
-- same physical movements used by sync_transaction_stock_movements().
DO $$
DECLARE
  t public.transactions%ROWTYPE;
  item jsonb;
  item_name text;
  qty numeric;
  product_id uuid;
  warehouse_id uuid;
  outlet_location_id uuid;
BEGIN
  FOR t IN
    SELECT tx.*
    FROM public.transactions tx
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.owner_id = tx.user_id
        AND sm.reference_type = 'transaction'
        AND sm.reference_id = tx.id
    )
    ORDER BY tx.created_at, tx.id
  LOOP
    warehouse_id := public.ensure_stock_location(t.user_id, 'warehouse', 'Gudang Utama');
    outlet_location_id := public.ensure_stock_location(
      t.user_id,
      'outlet',
      (SELECT o.name FROM public.outlets o WHERE o.id = t.outlet_id),
      t.outlet_id
    );

    -- New consignment: warehouse -> outlet.
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(t.new_consignment_items, '[]'::jsonb)) LOOP
      item_name := trim(item->>'name');
      qty := COALESCE((item->>'qty')::numeric, 0);

      IF item_name <> '' AND qty > 0 THEN
        SELECT p.id INTO product_id
        FROM public.products p
        WHERE p.user_id = t.user_id
          AND lower(p.name) = lower(item_name)
        LIMIT 1;

        IF product_id IS NOT NULL THEN
          INSERT INTO public.stock_movements(
            owner_id, product_id, movement_type,
            from_location_id, to_location_id, quantity,
            reference_type, reference_id, notes, occurred_at
          ) VALUES (
            t.user_id, product_id, 'transfer',
            warehouse_id, outlet_location_id, qty,
            'transaction', t.id, 'Backfill: konsinyasi historis', t.created_at
          );
        END IF;
      END IF;
    END LOOP;

    -- Returns: outlet -> warehouse. Direct sale: warehouse -> outside business.
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(t.line_items, '[]'::jsonb)) LOOP
      item_name := trim(item->>'name');

      IF item_name <> '' THEN
        SELECT p.id INTO product_id
        FROM public.products p
        WHERE p.user_id = t.user_id
          AND lower(p.name) = lower(item_name)
        LIMIT 1;

        IF product_id IS NOT NULL THEN
          qty := COALESCE((item->>'returned')::numeric, 0);
          IF qty > 0 THEN
            INSERT INTO public.stock_movements(
              owner_id, product_id, movement_type,
              from_location_id, to_location_id, quantity,
              reference_type, reference_id, notes, occurred_at
            ) VALUES (
              t.user_id, product_id, 'return_in',
              outlet_location_id, warehouse_id, qty,
              'transaction', t.id, 'Backfill: retur historis', t.created_at
            );
          END IF;

          IF t.transaction_type = 'Direct Sale' THEN
            qty := COALESCE((item->>'sold')::numeric, 0);
            IF qty > 0 THEN
              INSERT INTO public.stock_movements(
                owner_id, product_id, movement_type,
                from_location_id, to_location_id, quantity,
                reference_type, reference_id, notes, occurred_at
              ) VALUES (
                t.user_id, product_id, 'sale',
                warehouse_id, NULL, qty,
                'transaction', t.id, 'Backfill: penjualan langsung historis', t.created_at
              );
            END IF;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Outlet opening stock is a physical transfer from warehouse to outlet.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_outlet_opening_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  warehouse_id uuid;
  outlet_location_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'opening_stock'
      AND reference_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Remove the previous representation before replacing an edited opening row.
  DELETE FROM public.stock_movements
  WHERE reference_type = 'opening_stock'
    AND reference_id = NEW.id;

  SELECT sl.id INTO outlet_location_id
  FROM public.stock_locations sl
  WHERE sl.id = NEW.location_id
    AND sl.location_type = 'outlet'
    AND sl.outlet_id IS NOT NULL;

  IF outlet_location_id IS NULL OR NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;

  warehouse_id := public.ensure_stock_location(
    NEW.owner_id,
    'warehouse',
    'Gudang Utama'
  );

  INSERT INTO public.stock_movements(
    owner_id, product_id, movement_type,
    from_location_id, to_location_id, quantity,
    reference_type, reference_id, notes, occurred_at
  ) VALUES (
    NEW.owner_id,
    NEW.product_id,
    'transfer',
    warehouse_id,
    outlet_location_id,
    NEW.quantity,
    'opening_stock',
    NEW.id,
    'Stok awal outlet: transfer dari Gudang Utama',
    NEW.counted_at
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_outlet_opening_stock_movement_after_write
ON public.stock_opening_items;

CREATE TRIGGER sync_outlet_opening_stock_movement_after_write
AFTER INSERT OR UPDATE OR DELETE
ON public.stock_opening_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_outlet_opening_stock_movement();

-- Backfill opening transfers already present before this trigger existed.
INSERT INTO public.stock_movements(
  owner_id, product_id, movement_type,
  from_location_id, to_location_id, quantity,
  reference_type, reference_id, notes, occurred_at
)
SELECT
  soi.owner_id,
  soi.product_id,
  'transfer',
  wh.id,
  sl.id,
  soi.quantity,
  'opening_stock',
  soi.id,
  'Backfill: stok awal outlet dari Gudang Utama',
  soi.counted_at
FROM public.stock_opening_items soi
JOIN public.stock_locations sl
  ON sl.id = soi.location_id
 AND sl.location_type = 'outlet'
 AND sl.outlet_id IS NOT NULL
JOIN LATERAL (
  SELECT public.ensure_stock_location(soi.owner_id, 'warehouse', 'Gudang Utama') AS id
) wh ON TRUE
WHERE soi.quantity > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.reference_type = 'opening_stock'
      AND sm.reference_id = soi.id
  );

-- Outlet opening is now represented by the official movement ledger, so it must
-- not also be counted as an independent opening balance in the global view.
CREATE OR REPLACE VIEW public.master_stock_global AS
WITH opening AS (
  SELECT
    soi.owner_id,
    soi.product_id,
    soi.location_id,
    SUM(soi.quantity) AS qty
  FROM public.stock_opening_items soi
  JOIN public.stock_locations sl ON sl.id = soi.location_id
  WHERE sl.location_type <> 'outlet'
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
