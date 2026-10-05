-- Stage 4: revision rules.
-- Latest outlet visit may revise physical quantities.
-- Older visits may revise only financial fields: discount, payment, note.
-- Physical stock is maintained by stock_movements, not products.warehouse_stock.

DROP FUNCTION IF EXISTS public.recalculate_future_consignment_stock(uuid);

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
  effective_line_items jsonb;
  effective_new_items jsonb;
  item jsonb;
  item_name text;
  item_qty numeric;
  computed_sales numeric := 0;
  computed_previous numeric := 0;
  computed_due numeric := 0;
  computed_remaining numeric := 0;
  running_debt numeric := 0;
  later_tx public.transactions%ROWTYPE;
  latest_id uuid;
  is_latest_visit boolean := false;
BEGIN
  SELECT * INTO target
  FROM public.transactions
  WHERE id = _transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF auth.uid() IS NULL OR target.user_id <> public.business_owner_id() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF jsonb_typeof(_line_items) <> 'array'
     OR jsonb_typeof(_new_consignment_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid transaction items';
  END IF;

  IF _discount_amount < 0
     OR _amount_paid < 0
     OR length(coalesce(_custom_note, '')) > 500 THEN
    RAISE EXCEPTION 'Invalid payment or note';
  END IF;

  SELECT t.id INTO latest_id
  FROM public.transactions t
  WHERE t.outlet_id = target.outlet_id
  ORDER BY t.visit_date DESC, t.created_at DESC, t.id DESC
  LIMIT 1;

  is_latest_visit := latest_id = target.id;

  IF is_latest_visit THEN
    effective_line_items := _line_items;
    effective_new_items := CASE
      WHEN target.transaction_type = 'Consignment' THEN _new_consignment_items
      ELSE '[]'::jsonb
    END;
  ELSE
    -- Historical physical quantities are immutable.
    effective_line_items := coalesce(target.line_items, '[]'::jsonb);
    effective_new_items := CASE
      WHEN target.transaction_type = 'Consignment'
        THEN coalesce(target.new_consignment_items, '[]'::jsonb)
      ELSE '[]'::jsonb
    END;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(effective_line_items)
  LOOP
    item_name := trim(item->>'name');
    item_qty := coalesce((item->>'sold')::numeric, 0);

    IF item_name = ''
       OR item_qty < 0
       OR coalesce((item->>'returned')::numeric, 0) < 0
       OR coalesce((item->>'remaining')::numeric, 0) < 0
       OR coalesce((item->>'subtotal')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Invalid line item';
    END IF;

    IF target.transaction_type = 'Consignment'
       AND item_qty
         + coalesce((item->>'returned')::numeric, 0)
         + coalesce((item->>'remaining')::numeric, 0)
         <> coalesce((item->>'prev_stock')::numeric, 0) THEN
      RAISE EXCEPTION 'Consignment quantities do not balance';
    END IF;

    IF target.transaction_type = 'Consignment'
       AND target.stock_scheme = 'clean_pull'
       AND coalesce((item->>'remaining')::numeric, 0) <> 0 THEN
      RAISE EXCEPTION 'Clean pull cannot leave stock at outlet';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.user_id = target.user_id
        AND lower(p.name) = lower(item_name)
    ) THEN
      RAISE EXCEPTION 'Product not found: %', item_name;
    END IF;

    computed_sales := computed_sales
      + coalesce((item->>'subtotal')::numeric, 0);
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(effective_new_items)
  LOOP
    item_name := trim(item->>'name');
    item_qty := coalesce((item->>'qty')::numeric, 0);

    IF item_name = '' OR item_qty < 0 THEN
      RAISE EXCEPTION 'Invalid consignment item';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.user_id = target.user_id
        AND lower(p.name) = lower(item_name)
    ) THEN
      RAISE EXCEPTION 'Product not found: %', item_name;
    END IF;
  END LOOP;

  IF _discount_amount > computed_sales THEN
    RAISE EXCEPTION 'Discount exceeds sales';
  END IF;

  IF target.transaction_type = 'Consignment' THEN
    SELECT coalesce(t.remaining_debt, 0)
    INTO computed_previous
    FROM public.transactions t
    WHERE t.outlet_id = target.outlet_id
      AND t.transaction_type = 'Consignment'
      AND (t.visit_date, t.created_at, t.id)
          < (target.visit_date, target.created_at, target.id)
    ORDER BY t.visit_date DESC, t.created_at DESC, t.id DESC
    LIMIT 1;
  END IF;

  computed_previous := coalesce(computed_previous, 0);
  computed_due := computed_previous + computed_sales - _discount_amount;
  computed_remaining := greatest(0, computed_due - _amount_paid);

  UPDATE public.transactions
  SET line_items = effective_line_items,
      new_consignment_items = effective_new_items,
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
      WHERE outlet_id = target.outlet_id
        AND transaction_type = 'Consignment'
        AND (visit_date, created_at, id)
            > (target.visit_date, target.created_at, target.id)
      ORDER BY visit_date, created_at, id
      FOR UPDATE
    LOOP
      UPDATE public.transactions
      SET previous_debt = running_debt,
          total_due = running_debt + total_sales - discount_amount,
          remaining_debt = greatest(
            0,
            running_debt + total_sales - discount_amount - amount_paid
          )
      WHERE id = later_tx.id
      RETURNING remaining_debt INTO running_debt;
    END LOOP;
  END IF;

  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.revise_transaction(uuid, jsonb, jsonb, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_transaction(uuid, jsonb, jsonb, numeric, numeric, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
