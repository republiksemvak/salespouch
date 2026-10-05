CREATE OR REPLACE FUNCTION public.sync_transaction_stock_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  sales_location_id uuid;
  warehouse_location_id uuid;
  outlet_location_id uuid;
  item jsonb;
  item_name text;
  qty numeric;
  product_id uuid;
  sales_user uuid;
  source_location_id uuid;
  source_label text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_movements WHERE owner_id = OLD.user_id AND reference_type = 'transaction' AND reference_id = OLD.id;
    RETURN OLD;
  END IF;

  sales_user := NEW.sales_user_id;
  IF sales_user IS NULL THEN
    SELECT tm.user_id INTO sales_user FROM public.team_members tm
    LEFT JOIN public.profiles p ON p.id = tm.user_id
    WHERE tm.owner_id = NEW.user_id AND (
      lower(trim(COALESCE(p.display_name, ''))) = lower(trim(COALESCE(NEW.sales_name, '')))
      OR lower(trim(COALESCE(p.username, ''))) = lower(trim(COALESCE(NEW.sales_name, '')))
    ) LIMIT 1;
  END IF;
  sales_user := COALESCE(sales_user, NEW.user_id);
  sales_location_id := public.ensure_stock_location(NEW.user_id, 'sales', COALESCE(NULLIF(trim(NEW.sales_name), ''), 'Sales'), NULL, sales_user);
  warehouse_location_id := public.ensure_stock_location(NEW.user_id, 'warehouse', 'Gudang Utama');
  outlet_location_id := public.ensure_stock_location(NEW.user_id, 'outlet', (SELECT o.name FROM public.outlets o WHERE o.id = NEW.outlet_id), NEW.outlet_id, NULL);

  -- Serialize movements from the same Sales location, including concurrent visits.
  PERFORM 1 FROM public.stock_locations WHERE id = sales_location_id FOR UPDATE;
  DELETE FROM public.stock_movements WHERE owner_id = NEW.user_id AND reference_type = 'transaction' AND reference_id = NEW.id;

  IF NEW.transaction_type = 'Consignment' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.new_consignment_items, '[]'::jsonb)) LOOP
      item_name := trim(item->>'name');
      qty := COALESCE((item->>'qty')::numeric, 0);
      IF item_name <> '' AND qty > 0 THEN
        SELECT p.id INTO product_id FROM public.products p WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name) LIMIT 1;
        IF product_id IS NOT NULL THEN
          IF public.sales_location_balance(NEW.user_id, sales_location_id, product_id) < qty THEN
            RAISE EXCEPTION 'Stok Sales tidak cukup untuk produk %', item_name;
          END IF;
          INSERT INTO public.stock_movements(owner_id, product_id, movement_type, from_location_id, to_location_id, quantity, reference_type, reference_id, notes, occurred_at)
          VALUES (NEW.user_id, product_id, 'transfer', sales_location_id, outlet_location_id, qty, 'transaction', NEW.id, 'Field sales: Sales -> Outlet', NEW.created_at);
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF NEW.transaction_type = 'Direct Sale' THEN
    IF COALESCE(NEW.stock_source, 'sales') = 'warehouse' THEN
      source_location_id := warehouse_location_id;
      source_label := 'Gudang';
    ELSE
      source_location_id := sales_location_id;
      source_label := 'Sales';
    END IF;
  ELSE
    source_location_id := sales_location_id;
    source_label := 'Sales';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb)) LOOP
    item_name := trim(item->>'name');
    qty := COALESCE((item->>'returned')::numeric, 0);
    IF item_name <> '' AND qty > 0 THEN
      SELECT p.id INTO product_id FROM public.products p WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name) LIMIT 1;
      IF product_id IS NOT NULL THEN
        INSERT INTO public.stock_movements(owner_id, product_id, movement_type, from_location_id, to_location_id, quantity, reference_type, reference_id, notes, occurred_at)
        VALUES (NEW.user_id, product_id, 'return_in', outlet_location_id, source_location_id, qty, 'transaction', NEW.id, 'Retur Outlet -> ' || source_label, NEW.created_at);
      END IF;
    END IF;

    qty := COALESCE((item->>'sold')::numeric, 0);
    IF item_name <> '' AND qty > 0 THEN
      SELECT p.id INTO product_id FROM public.products p WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name) LIMIT 1;
      IF product_id IS NOT NULL THEN
        IF NEW.transaction_type = 'Consignment' THEN
          INSERT INTO public.stock_movements(owner_id, product_id, movement_type, from_location_id, to_location_id, quantity, reference_type, reference_id, notes, occurred_at)
          VALUES (NEW.user_id, product_id, 'sale', outlet_location_id, NULL, qty, 'transaction', NEW.id, 'Konsinyasi: terjual dari Outlet', NEW.created_at);
        ELSIF NEW.transaction_type = 'Direct Sale' THEN
          IF source_location_id = sales_location_id AND public.sales_location_balance(NEW.user_id, sales_location_id, product_id) < qty THEN
            RAISE EXCEPTION 'Stok Sales tidak cukup untuk produk %', item_name;
          END IF;
          INSERT INTO public.stock_movements(owner_id, product_id, movement_type, from_location_id, to_location_id, quantity, reference_type, reference_id, notes, occurred_at)
          VALUES (NEW.user_id, product_id, 'sale', source_location_id, NULL, qty, 'transaction', NEW.id, 'Direct Sale dari ' || source_label, NEW.created_at);
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_transaction_stock_movements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_transaction_stock_movements() TO authenticated, service_role;