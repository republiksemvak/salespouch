-- Sales Pouch stock foundation sync hardening
-- 1) Transaction physical stock movements feed Master Stok.
-- 2) Stock Pembukaan outlet is mirrored to legacy outlet_opening_stock.
-- 3) Revising a transaction recalculates future prev_stock snapshots.

CREATE OR REPLACE FUNCTION public.ensure_stock_location(
  _owner_id uuid,
  _location_type text,
  _name text,
  _outlet_id uuid DEFAULT NULL,
  _team_member_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  location_id uuid;
BEGIN
  IF _location_type = 'warehouse' THEN
    SELECT id INTO location_id
    FROM public.stock_locations
    WHERE owner_id = _owner_id
      AND location_type = 'warehouse'
    ORDER BY created_at
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name)
      VALUES (_owner_id, 'warehouse', COALESCE(NULLIF(trim(_name), ''), 'Gudang Utama'))
      RETURNING id INTO location_id;
    END IF;
  ELSIF _location_type = 'outlet' THEN
    SELECT id INTO location_id
    FROM public.stock_locations
    WHERE owner_id = _owner_id
      AND location_type = 'outlet'
      AND outlet_id = _outlet_id
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name, outlet_id)
      VALUES (_owner_id, 'outlet', COALESCE(NULLIF(trim(_name), ''), 'Outlet'), _outlet_id)
      RETURNING id INTO location_id;
    END IF;
  END IF;

  RETURN location_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_transaction_stock_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  warehouse_id uuid;
  outlet_id uuid;
  item jsonb;
  item_name text;
  qty numeric;
  product_id uuid;
BEGIN
  warehouse_id := public.ensure_stock_location(NEW.user_id, 'warehouse', 'Gudang Utama');
  outlet_id := public.ensure_stock_location(
    NEW.user_id,
    'outlet',
    (SELECT o.name FROM public.outlets o WHERE o.id = NEW.outlet_id),
    NEW.outlet_id
  );

  -- A revision replaces the physical movement representation for this note.
  DELETE FROM public.stock_movements
  WHERE owner_id = NEW.user_id
    AND reference_type = 'transaction'
    AND reference_id = NEW.id;

  -- New consignment: warehouse -> outlet.
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.new_consignment_items, '[]'::jsonb)) LOOP
    item_name := trim(item->>'name');
    qty := COALESCE((item->>'qty')::numeric, 0);
    IF item_name <> '' AND qty > 0 THEN
      SELECT p.id INTO product_id
      FROM public.products p
      WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name)
      LIMIT 1;

      IF product_id IS NOT NULL THEN
        INSERT INTO public.stock_movements(
          owner_id, product_id, movement_type, from_location_id, to_location_id,
          quantity, reference_type, reference_id, notes, occurred_at
        ) VALUES (
          NEW.user_id, product_id, 'transfer', warehouse_id, outlet_id,
          qty, 'transaction', NEW.id, 'Konsinyasi baru', NEW.created_at
        );
      END IF;
    END IF;
  END LOOP;

  -- Returns: outlet -> warehouse. Direct sales are warehouse -> business sale.
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb)) LOOP
    item_name := trim(item->>'name');
    IF item_name <> '' THEN
      SELECT p.id INTO product_id
      FROM public.products p
      WHERE p.user_id = NEW.user_id AND lower(p.name) = lower(item_name)
      LIMIT 1;

      IF product_id IS NOT NULL THEN
        qty := COALESCE((item->>'returned')::numeric, 0);
        IF qty > 0 THEN
          INSERT INTO public.stock_movements(
            owner_id, product_id, movement_type, from_location_id, to_location_id,
            quantity, reference_type, reference_id, notes, occurred_at
          ) VALUES (
            NEW.user_id, product_id, 'return_in', outlet_id, warehouse_id,
            qty, 'transaction', NEW.id, 'Retur dari outlet', NEW.created_at
          );
        END IF;

        IF NEW.transaction_type = 'Direct Sale' THEN
          qty := COALESCE((item->>'sold')::numeric, 0);
          IF qty > 0 THEN
            INSERT INTO public.stock_movements(
              owner_id, product_id, movement_type, from_location_id, to_location_id,
              quantity, reference_type, reference_id, notes, occurred_at
            ) VALUES (
              NEW.user_id, product_id, 'sale', warehouse_id, NULL,
              qty, 'transaction', NEW.id, 'Penjualan langsung', NEW.created_at
            );
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_transaction_stock_movements_after_write
ON public.transactions;

CREATE TRIGGER sync_transaction_stock_movements_after_write
AFTER INSERT OR UPDATE OF line_items, new_consignment_items, transaction_type
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_transaction_stock_movements();

CREATE OR REPLACE FUNCTION public.sync_outlet_opening_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  location_type_value text;
  outlet_id_value uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT sl.location_type, sl.outlet_id
      INTO location_type_value, outlet_id_value
    FROM public.stock_locations sl
    WHERE sl.id = OLD.location_id;

    IF location_type_value = 'outlet' AND outlet_id_value IS NOT NULL THEN
      DELETE FROM public.outlet_opening_stock
      WHERE outlet_id = outlet_id_value AND product_id = OLD.product_id;
    END IF;
    RETURN OLD;
  END IF;

  SELECT sl.location_type, sl.outlet_id
    INTO location_type_value, outlet_id_value
  FROM public.stock_locations sl
  WHERE sl.id = NEW.location_id;

  IF location_type_value = 'outlet' AND outlet_id_value IS NOT NULL THEN
    INSERT INTO public.outlet_opening_stock(user_id, outlet_id, product_id, quantity, opened_at)
    VALUES (NEW.owner_id, outlet_id_value, NEW.product_id, NEW.quantity, NEW.counted_at)
    ON CONFLICT (outlet_id, product_id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      quantity = EXCLUDED.quantity,
      opened_at = EXCLUDED.opened_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_outlet_opening_stock_after_write
ON public.stock_opening_items;

CREATE TRIGGER sync_outlet_opening_stock_after_write
AFTER INSERT OR UPDATE OR DELETE ON public.stock_opening_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_outlet_opening_stock();

CREATE OR REPLACE FUNCTION public.recalculate_future_consignment_stock(_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  anchor public.transactions%ROWTYPE;
  tx public.transactions%ROWTYPE;
  previous_stock jsonb := '{}'::jsonb;
  updated_items jsonb;
  item jsonb;
  key text;
  qty numeric;
BEGIN
  SELECT * INTO anchor
  FROM public.transactions
  WHERE id = _transaction_id;

  IF NOT FOUND OR anchor.transaction_type <> 'Consignment' THEN
    RETURN;
  END IF;

  FOR tx IN
    SELECT *
    FROM public.transactions
    WHERE outlet_id = anchor.outlet_id
      AND transaction_type = 'Consignment'
      AND (visit_date, created_at, id) >= (anchor.visit_date, anchor.created_at, anchor.id)
    ORDER BY visit_date, created_at, id
    FOR UPDATE
  LOOP
    -- The anchor already contains the revised values. Later transactions are rebuilt
    -- from the physical stock left by the immediately preceding visit.
    IF tx.id <> anchor.id THEN
      updated_items := '[]'::jsonb;
      FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(tx.line_items, '[]'::jsonb)) LOOP
        key := lower(trim(item->>'name'));
        qty := COALESCE((previous_stock->>key)::numeric, 0);
        updated_items := updated_items || jsonb_build_array(
          jsonb_set(item, '{prev_stock}', to_jsonb(qty), true)
        );
      END LOOP;

      UPDATE public.transactions
      SET line_items = updated_items
      WHERE id = tx.id;

      tx.line_items := updated_items;
    END IF;

    previous_stock := '{}'::jsonb;
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(tx.line_items, '[]'::jsonb)) LOOP
      key := lower(trim(item->>'name'));
      IF tx.stock_scheme = 'accumulation' THEN
        qty := COALESCE((item->>'remaining')::numeric, 0);
      ELSE
        qty := 0;
      END IF;
      IF qty > 0 THEN
        previous_stock := jsonb_set(previous_stock, ARRAY[key], to_jsonb(qty), true);
      END IF;
    END LOOP;

    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(tx.new_consignment_items, '[]'::jsonb)) LOOP
      key := lower(trim(item->>'name'));
      qty := COALESCE((previous_stock->>key)::numeric, 0) + COALESCE((item->>'qty')::numeric, 0);
      IF qty > 0 THEN
        previous_stock := jsonb_set(previous_stock, ARRAY[key], to_jsonb(qty), true);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Extend revise_transaction with a post-revision physical-stock recalculation.
-- The existing function remains responsible for warehouse rollback and debt cascade.
CREATE OR REPLACE FUNCTION public.revise_transaction(
  _transaction_id uuid,
  _line_items jsonb,
  _new_consignment_items jsonb,
  _discount_amount numeric,
  _amount_paid numeric,
  _custom_note text
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.transactions%ROWTYPE;
  changed public.transactions%ROWTYPE;
  item jsonb;
  item_name text;
  item_qty numeric;
  computed_sales numeric := 0;
  computed_previous numeric := 0;
  computed_due numeric := 0;
  computed_remaining numeric := 0;
  running_debt numeric := 0;
  later_tx public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.transactions WHERE id = _transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF auth.uid() IS NULL OR target.user_id <> public.business_owner_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF jsonb_typeof(_line_items) <> 'array' OR jsonb_typeof(_new_consignment_items) <> 'array' THEN RAISE EXCEPTION 'Invalid transaction items'; END IF;
  IF _discount_amount < 0 OR _amount_paid < 0 OR length(coalesce(_custom_note, '')) > 500 THEN RAISE EXCEPTION 'Invalid payment or note'; END IF;

  PERFORM 1 FROM public.products WHERE user_id = target.user_id FOR UPDATE;

  FOR item IN SELECT value FROM jsonb_array_elements(target.new_consignment_items) LOOP
    UPDATE public.products SET warehouse_stock = warehouse_stock + coalesce((item->>'qty')::numeric, 0)
     WHERE user_id = target.user_id AND lower(name) = lower(item->>'name');
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(target.line_items) LOOP
    UPDATE public.products
       SET warehouse_stock = warehouse_stock - coalesce((item->>'returned')::numeric, 0)
           + CASE WHEN target.transaction_type = 'Direct Sale' THEN coalesce((item->>'sold')::numeric, 0) ELSE 0 END
     WHERE user_id = target.user_id AND lower(name) = lower(item->>'name');
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(_line_items) LOOP
    item_name := trim(item->>'name');
    item_qty := coalesce((item->>'sold')::numeric, 0);
    IF item_name = '' OR item_qty < 0 OR coalesce((item->>'returned')::numeric, 0) < 0 OR coalesce((item->>'remaining')::numeric, 0) < 0 OR coalesce((item->>'subtotal')::numeric, 0) < 0 THEN RAISE EXCEPTION 'Invalid line item'; END IF;
    IF target.transaction_type = 'Consignment' AND item_qty + coalesce((item->>'returned')::numeric, 0) + coalesce((item->>'remaining')::numeric, 0) <> coalesce((item->>'prev_stock')::numeric, 0) THEN RAISE EXCEPTION 'Consignment quantities do not balance'; END IF;
    IF target.transaction_type = 'Consignment' AND target.stock_scheme = 'clean_pull' AND coalesce((item->>'remaining')::numeric, 0) <> 0 THEN RAISE EXCEPTION 'Clean pull cannot leave stock at outlet'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE user_id = target.user_id AND lower(name) = lower(item_name)) THEN RAISE EXCEPTION 'Product not found: %', item_name; END IF;
    computed_sales := computed_sales + coalesce((item->>'subtotal')::numeric, 0);
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(_new_consignment_items) LOOP
    item_name := trim(item->>'name');
    item_qty := coalesce((item->>'qty')::numeric, 0);
    IF item_name = '' OR item_qty < 0 OR NOT EXISTS (SELECT 1 FROM public.products WHERE user_id = target.user_id AND lower(name) = lower(item_name)) THEN RAISE EXCEPTION 'Invalid consignment item'; END IF;
    UPDATE public.products SET warehouse_stock = warehouse_stock - item_qty WHERE user_id = target.user_id AND lower(name) = lower(item_name);
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(_line_items) LOOP
    UPDATE public.products
       SET warehouse_stock = warehouse_stock + coalesce((item->>'returned')::numeric, 0)
           - CASE WHEN target.transaction_type = 'Direct Sale' THEN coalesce((item->>'sold')::numeric, 0) ELSE 0 END
     WHERE user_id = target.user_id AND lower(name) = lower(item->>'name');
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.products WHERE user_id = target.user_id AND warehouse_stock < 0) THEN RAISE EXCEPTION 'Warehouse stock is insufficient'; END IF;
  IF _discount_amount > computed_sales THEN RAISE EXCEPTION 'Discount exceeds sales'; END IF;

  IF target.transaction_type = 'Consignment' THEN
    SELECT coalesce(t.remaining_debt, 0) INTO computed_previous
    FROM public.transactions t
    WHERE t.outlet_id = target.outlet_id AND t.transaction_type = 'Consignment'
      AND (t.visit_date, t.created_at, t.id) < (target.visit_date, target.created_at, target.id)
    ORDER BY t.visit_date DESC, t.created_at DESC, t.id DESC LIMIT 1;
  END IF;

  computed_previous := coalesce(computed_previous, 0);
  computed_due := computed_previous + computed_sales - _discount_amount;
  computed_remaining := greatest(0, computed_due - _amount_paid);

  UPDATE public.transactions
  SET line_items = _line_items,
      new_consignment_items = CASE WHEN target.transaction_type = 'Consignment' THEN _new_consignment_items ELSE '[]'::jsonb END,
      total_sales = computed_sales,
      discount_amount = _discount_amount,
      previous_debt = computed_previous,
      total_due = computed_due,
      amount_paid = _amount_paid,
      remaining_debt = computed_remaining,
      custom_note = nullif(trim(coalesce(_custom_note, '')), ''),
      revised_at = now()
  WHERE id = target.id
  RETURNING * INTO changed;

  IF target.transaction_type = 'Consignment' THEN
    running_debt := computed_remaining;
    FOR later_tx IN
      SELECT * FROM public.transactions
      WHERE outlet_id = target.outlet_id AND transaction_type = 'Consignment'
        AND (visit_date, created_at, id) > (target.visit_date, target.created_at, target.id)
      ORDER BY visit_date, created_at, id FOR UPDATE
    LOOP
      UPDATE public.transactions
      SET previous_debt = running_debt,
          total_due = running_debt + total_sales - discount_amount,
          remaining_debt = greatest(0, running_debt + total_sales - discount_amount - amount_paid)
      WHERE id = later_tx.id
      RETURNING remaining_debt INTO running_debt;
    END LOOP;
  END IF;

  IF target.transaction_type = 'Consignment' THEN
    PERFORM public.recalculate_future_consignment_stock(target.id);
  END IF;

  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_stock_location(uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_stock_location(uuid, text, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.sync_transaction_stock_movements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_transaction_stock_movements() TO service_role;
REVOKE ALL ON FUNCTION public.sync_outlet_opening_stock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_outlet_opening_stock() TO service_role;
REVOKE ALL ON FUNCTION public.recalculate_future_consignment_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_future_consignment_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revise_transaction(uuid, jsonb, jsonb, numeric, numeric, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
