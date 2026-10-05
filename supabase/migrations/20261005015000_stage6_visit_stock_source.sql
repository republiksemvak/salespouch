-- Stage 6: make the visit form's stock-source choice explicit.
-- Field sales consume the assigned Sales location.
-- Warehouse direct sales consume the Main Warehouse location.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stock_source text NOT NULL DEFAULT 'sales'
  CHECK (stock_source IN ('sales', 'warehouse'));

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
  item jsonb;
  item_name text;
  qty numeric;
  product_id uuid;
  sales_user uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_movements
    WHERE owner_id = OLD.user_id
      AND reference_type = 'transaction'
      AND reference_id = OLD.id;
    RETURN OLD;
  END IF;

  DELETE FROM public.stock_movements
  WHERE owner_id = NEW.user_id
    AND reference_type = 'transaction'
    AND reference_id = NEW.id;

  IF NEW.stock_source = 'warehouse' THEN
    source_location_id := public.ensure_stock_location(
      NEW.user_id, 'warehouse', 'Gudang Utama'
    );
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

    sales_user := COALESCE(sales_user, NEW.user_id);

    sales_location_id := public.ensure_stock_location(
      NEW.user_id,
      'sales',
      COALESCE(NULLIF(trim(NEW.sales_name), ''), 'Sales'),
      NULL,
      sales_user
    );
    source_location_id := sales_location_id;
  END IF;

  outlet_location_id := public.ensure_stock_location(
    NEW.user_id,
    'outlet',
    (SELECT o.name FROM public.outlets o WHERE o.id = NEW.outlet_id),
    NEW.outlet_id,
    NULL
  );

  -- New consignment moves from the selected source into the outlet.
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
    -- Warehouse direct sale has no physical transfer into the outlet.
    -- The sold quantity leaves the warehouse directly.
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

  -- Returns from the outlet always go back to the source that handled the visit.
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
  -- already handled above from the warehouse source.
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
