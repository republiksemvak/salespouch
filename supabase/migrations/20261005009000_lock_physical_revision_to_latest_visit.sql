-- Blueprint rule:
-- Physical quantities may only be revised on the latest visit for an outlet.
-- Older notes may still be revised financially (discount/payment/debt/note),
-- but their physical line_items/new_consignment_items are immutable.

CREATE OR REPLACE FUNCTION public.validate_transaction_physical_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_id uuid;
  physical_changed boolean;
BEGIN
  -- Approved internal future-stock recalculation is allowed to rewrite later
  -- snapshots. The flag is LOCAL to the current database transaction.
  IF current_setting('salespouch.internal_physical_rebuild', true) = 'on' THEN
    RETURN NEW;
  END IF;

  physical_changed :=
    OLD.line_items IS DISTINCT FROM NEW.line_items
    OR OLD.new_consignment_items IS DISTINCT FROM NEW.new_consignment_items;

  IF NOT physical_changed THEN
    RETURN NEW;
  END IF;

  SELECT t.id
  INTO latest_id
  FROM public.transactions t
  WHERE t.outlet_id = OLD.outlet_id
  ORDER BY t.visit_date DESC, t.created_at DESC, t.id DESC
  LIMIT 1;

  IF latest_id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION
      'Kuantitas fisik hanya dapat direvisi pada nota kunjungan terakhir outlet. Nota terdahulu hanya dapat direvisi secara finansial.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_transaction_physical_revision_before_update
ON public.transactions;

CREATE TRIGGER validate_transaction_physical_revision_before_update
BEFORE UPDATE OF line_items, new_consignment_items, revised_at
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.validate_transaction_physical_revision();

-- Keep the existing approved future-stock cascade, but mark its own line-item
-- rewrites as internal so the latest-visit rule does not block them.
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
  PERFORM set_config('salespouch.internal_physical_rebuild', 'on', true);

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

REVOKE ALL ON FUNCTION public.validate_transaction_physical_revision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_transaction_physical_revision() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_future_consignment_stock(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
