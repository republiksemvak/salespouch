ALTER TABLE public.profiles
  ADD COLUMN stock_scheme text NOT NULL DEFAULT 'clean_pull'
  CONSTRAINT profiles_stock_scheme_check CHECK (stock_scheme IN ('accumulation', 'clean_pull'));

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (business_name, business_address, business_phone, stock_scheme) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.transactions
  ADD COLUMN stock_scheme text NOT NULL DEFAULT 'clean_pull'
  CONSTRAINT transactions_stock_scheme_check CHECK (stock_scheme IN ('accumulation', 'clean_pull'));

CREATE OR REPLACE FUNCTION public.apply_visit_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  item_name text;
  delta numeric;
  previous_qty numeric;
  sold_qty numeric;
  returned_qty numeric;
  remaining_qty numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.outlets WHERE id = NEW.outlet_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Outlet does not belong to business';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(NEW.new_consignment_items) LOOP
    item_name := trim(item->>'name');
    delta := coalesce((item->>'qty')::numeric, 0);
    IF item_name = '' OR delta < 0 THEN
      RAISE EXCEPTION 'Invalid consignment item';
    END IF;
    UPDATE public.products
       SET warehouse_stock = warehouse_stock - delta
     WHERE user_id = NEW.user_id AND lower(name) = lower(item_name);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', item_name;
    END IF;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(NEW.line_items) LOOP
    item_name := trim(item->>'name');
    previous_qty := coalesce((item->>'prev_stock')::numeric, 0);
    sold_qty := coalesce((item->>'sold')::numeric, 0);
    returned_qty := coalesce((item->>'returned')::numeric, 0);
    remaining_qty := coalesce((item->>'remaining')::numeric, 0);

    IF item_name = '' OR previous_qty < 0 OR sold_qty < 0 OR returned_qty < 0 OR remaining_qty < 0 THEN
      RAISE EXCEPTION 'Invalid line item';
    END IF;
    IF NEW.transaction_type = 'Consignment' AND sold_qty + returned_qty + remaining_qty <> previous_qty THEN
      RAISE EXCEPTION 'Consignment quantities do not balance';
    END IF;
    IF NEW.transaction_type = 'Consignment' AND NEW.stock_scheme = 'clean_pull' AND remaining_qty <> 0 THEN
      RAISE EXCEPTION 'Clean pull cannot leave stock at outlet';
    END IF;

    delta := returned_qty - CASE WHEN NEW.transaction_type = 'Direct Sale' THEN sold_qty ELSE 0 END;
    UPDATE public.products
       SET warehouse_stock = warehouse_stock + delta
     WHERE user_id = NEW.user_id AND lower(name) = lower(item_name);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', item_name;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.products WHERE user_id = NEW.user_id AND warehouse_stock < 0) THEN
    RAISE EXCEPTION 'Warehouse stock is insufficient';
  END IF;

  RETURN NEW;
END;
$$;

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
  previous_qty numeric;
  sold_qty numeric;
  returned_qty numeric;
  remaining_qty numeric;
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
    previous_qty := coalesce((item->>'prev_stock')::numeric, 0);
    sold_qty := coalesce((item->>'sold')::numeric, 0);
    returned_qty := coalesce((item->>'returned')::numeric, 0);
    remaining_qty := coalesce((item->>'remaining')::numeric, 0);
    IF item_name = '' OR previous_qty < 0 OR sold_qty < 0 OR returned_qty < 0 OR remaining_qty < 0 OR coalesce((item->>'subtotal')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Invalid line item';
    END IF;
    IF target.transaction_type = 'Consignment' AND sold_qty + returned_qty + remaining_qty <> previous_qty THEN
      RAISE EXCEPTION 'Consignment quantities do not balance';
    END IF;
    IF target.transaction_type = 'Consignment' AND target.stock_scheme = 'clean_pull' AND remaining_qty <> 0 THEN
      RAISE EXCEPTION 'Clean pull cannot leave stock at outlet';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE user_id = target.user_id AND lower(name) = lower(item_name)) THEN
      RAISE EXCEPTION 'Product not found: %', item_name;
    END IF;
    computed_sales := computed_sales + coalesce((item->>'subtotal')::numeric, 0);
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(_new_consignment_items) LOOP
    item_name := trim(item->>'name');
    item_qty := coalesce((item->>'qty')::numeric, 0);
    IF item_name = '' OR item_qty < 0 OR NOT EXISTS (SELECT 1 FROM public.products WHERE user_id = target.user_id AND lower(name) = lower(item_name)) THEN
      RAISE EXCEPTION 'Invalid consignment item';
    END IF;
    UPDATE public.products SET warehouse_stock = warehouse_stock - item_qty
     WHERE user_id = target.user_id AND lower(name) = lower(item_name);
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
    computed_previous := coalesce(computed_previous, 0);
  ELSE
    computed_previous := 0;
  END IF;

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
   WHERE id = target.id RETURNING * INTO changed;

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
       WHERE id = later_tx.id RETURNING remaining_debt INTO running_debt;
    END LOOP;
  END IF;

  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.revise_transaction(uuid, jsonb, jsonb, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_transaction(uuid, jsonb, jsonb, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revise_transaction(uuid, jsonb, jsonb, numeric, numeric, text) TO service_role;