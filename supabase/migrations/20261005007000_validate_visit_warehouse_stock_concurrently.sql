-- Enforce warehouse stock availability at the database boundary.
-- This protects visits when the client is offline/slow and also closes the
-- concurrent-submit race by locking each affected product row before checking.

CREATE OR REPLACE FUNCTION public.validate_transaction_warehouse_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_name text;
  requested_delta numeric;
  current_stock numeric;
BEGIN
  FOR item_name, requested_delta IN
    SELECT
      lower(trim(x.item->>'name')),
      SUM(
        CASE
          WHEN NEW.transaction_type = 'Direct Sale'
            THEN COALESCE((x.item->>'sold')::numeric, 0)
          ELSE 0
        END
        + CASE
            WHEN x.source = 'new_consignment'
              THEN COALESCE((x.item->>'qty')::numeric, 0)
            ELSE 0
          END
        - COALESCE((x.item->>'returned')::numeric, 0)
      )
    FROM (
      SELECT value AS item, 'line' AS source
      FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb))
      UNION ALL
      SELECT value AS item, 'new_consignment' AS source
      FROM jsonb_array_elements(COALESCE(NEW.new_consignment_items, '[]'::jsonb))
    ) x
    WHERE trim(x.item->>'name') <> ''
    GROUP BY lower(trim(x.item->>'name'))
    HAVING SUM(
      CASE
        WHEN NEW.transaction_type = 'Direct Sale'
          THEN COALESCE((x.item->>'sold')::numeric, 0)
        ELSE 0
      END
      + CASE
          WHEN x.source = 'new_consignment'
            THEN COALESCE((x.item->>'qty')::numeric, 0)
          ELSE 0
        END
      - COALESCE((x.item->>'returned')::numeric, 0)
    ) > 0
  LOOP
    SELECT p.warehouse_stock
      INTO current_stock
    FROM public.products p
    WHERE p.user_id = NEW.user_id
      AND lower(p.name) = item_name
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', item_name;
    END IF;

    IF COALESCE(current_stock, 0) < requested_delta THEN
      RAISE EXCEPTION 'Warehouse stock is insufficient for product: %', item_name;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_transaction_warehouse_stock()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_transaction_warehouse_stock_before_insert
ON public.transactions;

CREATE TRIGGER validate_transaction_warehouse_stock_before_insert
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.validate_transaction_warehouse_stock();

NOTIFY pgrst, 'reload schema';
