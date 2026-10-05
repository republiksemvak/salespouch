-- Guard transaction/order stock synchronization at the database boundary.
-- The UI already checks available stock, but concurrent writes must be rejected
-- atomically by the stock-movement trigger as well.

CREATE OR REPLACE FUNCTION public.sync_transaction_stock_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_location_id uuid;
  sales_location_id uuid;
  outlet_location_id uuid;
  warehouse_location_id uuid;
  item jsonb;
  item_name text;
  qty numeric;
  product_id uuid;
  sales_user uuid;
  available_stock numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_movements
    WHERE owner_id = OLD.user_id
      AND reference_type = 'transaction'
      AND reference_id = OLD.id;
    RETURN OLD;
  END IF;

  -- A revision replaces the physical movement representation for this note.
  -- Deleting first also makes the availability check below evaluate the stock
  -- state as if this transaction did not yet exist.
  DELETE FROM public.stock_movements
  WHERE owner_id = NEW.user_id
    AND reference_type = 'transaction'
    AND reference_id = NEW.id;

  SELECT sl.id INTO warehouse_location_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = NEW.user_id
    AND sl.location_type = 'warehouse'
    AND sl.is_active = true
  ORDER BY sl.created_at
  LIMIT 1;

  IF warehouse_location_id IS NULL THEN
    RAISE EXCEPTION 'Gudang Utama belum terdaftar.';
  END IF;

  IF NEW.stock_source = 'warehouse' THEN
    source_location_id := warehouse_location_id;
  ELSE
    sales_user := NEW.sales_user_id;

    IF sales_user IS NULL THEN
      SELECT tm.user_id INTO sales_user
      FROM public.team_members tm
      LEFT JOIN public.profiles p ON p.id = tm.user_id
      WHERE tm.owner_id = NEW.user_id
        AND (
          lower(trim(COALESCE(p.display_name, ''))) = lower(trim(NEW.sales_name))
          OR lower(trim(COALESCE(p.username, ''))) = lower(trim(NEW.sales_name))
        )
      LIMIT 1;
    END IF;

    IF sales_user IS NULL THEN
      RAISE EXCEPTION 'Sales belum ditemukan untuk transaksi ini.';
    END IF;

    SELECT sl.id INTO sales_location_id
    FROM public.stock_locations sl
    WHERE sl.owner_id = NEW.user_id
      AND sl.location_type = 'sales'
      AND sl.team_member_user_id = sales_user
      AND sl.is_active = true
    ORDER BY sl.created_at
    LIMIT 1;

    IF sales_location_id IS NULL THEN
      RAISE EXCEPTION 'Lokasi stok Sales belum terdaftar.';
    END IF;

    source_location_id := sales_location_id;
  END IF;

  outlet_location_id := public.ensure_stock_location(
    NEW.user_id,
    'outlet',
    (SELECT o.name FROM public.outlets o WHERE o.id = NEW.outlet_id),
    NEW.outlet_id,
    NULL
  );

  -- Validate every physical outbound movement before writing any new movement.
  -- This closes the race window left by client-side stock checks.
  IF NEW.stock_source = 'sales' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.new_consignment_items, '[]'::jsonb)) LOOP
      item_name := trim(item->>'name');
      qty := COALESCE((item->>'qty')::numeric, 0);

      IF item_name = '' OR qty < 0 THEN
        RAISE EXCEPTION 'Invalid consignment item.';
      END IF;

      IF qty > 0 THEN
        SELECT p.id INTO product_id
        FROM public.products p
        WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name)
        LIMIT 1;

        IF product_id IS NULL THEN
          RAISE EXCEPTION 'Product not found: %', item_name;
        END IF;

        available_stock := public.sales_location_balance(
          NEW.user_id, source_location_id, product_id
        );

        IF available_stock < qty THEN
          RAISE EXCEPTION 'Stok Sales tidak cukup untuk %. Tersedia %, dibutuhkan %.', item_name, available_stock, qty;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF NEW.transaction_type = 'Direct Sale' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb)) LOOP
      item_name := trim(item->>'name');
      qty := COALESCE((item->>'sold')::numeric, 0);

      IF item_name = '' OR qty < 0 THEN
        RAISE EXCEPTION 'Invalid direct-sale item.';
      END IF;

      IF qty > 0 THEN
        SELECT p.id INTO product_id
        FROM public.products p
        WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name)
        LIMIT 1;

        IF product_id IS NULL THEN
          RAISE EXCEPTION 'Product not found: %', item_name;
        END IF;

        IF NEW.stock_source = 'sales' THEN
          available_stock := public.sales_location_balance(
            NEW.user_id, source_location_id, product_id
          );
        ELSE
          SELECT COALESCE((
            SELECT SUM(soi.quantity)
            FROM public.stock_opening_items soi
            WHERE soi.owner_id = NEW.user_id
              AND soi.location_id = warehouse_location_id
              AND soi.product_id = product_id
          ), 0)
          + COALESCE((
            SELECT SUM(sm.quantity)
            FROM public.stock_movements sm
            WHERE sm.owner_id = NEW.user_id
              AND sm.to_location_id = warehouse_location_id
              AND sm.product_id = product_id
          ), 0)
          - COALESCE((
            SELECT SUM(sm.quantity)
            FROM public.stock_movements sm
            WHERE sm.owner_id = NEW.user_id
              AND sm.from_location_id = warehouse_location_id
              AND sm.product_id = product_id
          ), 0)
          INTO available_stock;
        END IF;

        IF available_stock < qty THEN
          RAISE EXCEPTION 'Stok tidak cukup untuk %. Tersedia %, dibutuhkan %.', item_name, available_stock, qty;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- New consignment: selected source -> outlet.
  IF NEW.stock_source = 'sales' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.new_consignment_items, '[]'::jsonb)) LOOP
      item_name := trim(item->>'name');
      qty := COALESCE((item->>'qty')::numeric, 0);
      IF item_name <> '' AND qty > 0 THEN
        SELECT p.id INTO product_id FROM public.products p
        WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name) LIMIT 1;
        IF product_id IS NOT NULL THEN
          INSERT INTO public.stock_movements(
            owner_id, product_id, movement_type, from_location_id, to_location_id,
            quantity, reference_type, reference_id, notes, occurred_at
          ) VALUES (
            NEW.user_id, product_id, 'transfer', source_location_id, outlet_location_id,
            qty, 'transaction', NEW.id, 'Field sales: konsinyasi Sales -> Outlet', NEW.created_at
          );
        END IF;
      END IF;
    END LOOP;
  ELSE
    -- Warehouse direct sale leaves the warehouse without an outlet stock transfer.
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb)) LOOP
      item_name := trim(item->>'name');
      qty := COALESCE((item->>'sold')::numeric, 0);
      IF item_name <> '' AND qty > 0 THEN
        SELECT p.id INTO product_id FROM public.products p
        WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name) LIMIT 1;
        IF product_id IS NOT NULL THEN
          INSERT INTO public.stock_movements(
            owner_id, product_id, movement_type, from_location_id, to_location_id,
            quantity, reference_type, reference_id, notes, occurred_at
          ) VALUES (
            NEW.user_id, product_id, 'sale', source_location_id, NULL,
            qty, 'transaction', NEW.id, 'Warehouse direct sale: Gudang -> sold out', NEW.created_at
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Returns go back to the source that handled the visit.
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb)) LOOP
    item_name := trim(item->>'name');
    qty := COALESCE((item->>'returned')::numeric, 0);
    IF item_name <> '' AND qty > 0 THEN
      SELECT p.id INTO product_id FROM public.products p
      WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name) LIMIT 1;
      IF product_id IS NOT NULL THEN
        INSERT INTO public.stock_movements(
          owner_id, product_id, movement_type, from_location_id, to_location_id,
          quantity, reference_type, reference_id, notes, occurred_at
        ) VALUES (
          NEW.user_id, product_id, 'return_in', outlet_location_id, source_location_id,
          qty, 'transaction', NEW.id,
          CASE WHEN NEW.stock_source = 'warehouse'
            THEN 'Warehouse direct sale: retur Outlet -> Gudang'
            ELSE 'Field sales: retur Outlet -> Sales'
          END,
          NEW.created_at
        );
      END IF;
    END IF;
  END LOOP;

  -- Field-sales direct sale consumes Sales stock. Warehouse direct sale was
  -- already handled above.
  IF NEW.transaction_type = 'Direct Sale' AND NEW.stock_source = 'sales' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb)) LOOP
      item_name := trim(item->>'name');
      qty := COALESCE((item->>'sold')::numeric, 0);
      IF item_name <> '' AND qty > 0 THEN
        SELECT p.id INTO product_id FROM public.products p
        WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name) LIMIT 1;
        IF product_id IS NOT NULL THEN
          INSERT INTO public.stock_movements(
            owner_id, product_id, movement_type, from_location_id, to_location_id,
            quantity, reference_type, reference_id, notes, occurred_at
          ) VALUES (
            NEW.user_id, product_id, 'sale', source_location_id, NULL,
            qty, 'transaction', NEW.id, 'Field sales: penjualan langsung dari Sales', NEW.created_at
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_transaction_stock_movements_after_write ON public.transactions;
CREATE TRIGGER sync_transaction_stock_movements_after_write
AFTER INSERT OR DELETE OR UPDATE OF line_items, new_consignment_items, transaction_type, sales_user_id, sales_name, stock_source
ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_transaction_stock_movements();

REVOKE ALL ON FUNCTION public.sync_transaction_stock_movements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_transaction_stock_movements() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
