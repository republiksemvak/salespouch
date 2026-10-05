-- Stage 2: Separate field-sales stock from warehouse direct selling.
-- Field-sales transactions consume Sales locations.
-- Warehouse direct sales consume the Main Warehouse location.
-- This migration changes future movement routing only; historical ledger reconciliation
-- is intentionally deferred to the final live-SQL phase.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS sales_user_id uuid REFERENCES public.profiles(id);

-- Legacy field-sales transactions may not have a sales_user_id yet. New writes from
-- the app will populate it. The movement function falls back to the transaction owner
-- so the owner can also act as a field seller.

DROP TRIGGER IF EXISTS apply_visit_stock_after_insert
ON public.transactions;

DROP FUNCTION IF EXISTS public.apply_visit_stock();

CREATE OR REPLACE FUNCTION public.sync_transaction_stock_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

  sales_user := COALESCE(NEW.sales_user_id, NEW.user_id);

  sales_location_id := public.ensure_stock_location(
    NEW.user_id,
    'sales',
    COALESCE(NULLIF(trim(NEW.sales_name), ''), 'Sales'),
    NULL,
    sales_user
  );

  outlet_location_id := public.ensure_stock_location(
    NEW.user_id,
    'outlet',
    (SELECT o.name FROM public.outlets o WHERE o.id = NEW.outlet_id),
    NEW.outlet_id,
    NULL
  );

  DELETE FROM public.stock_movements
  WHERE owner_id = NEW.user_id
    AND reference_type = 'transaction'
    AND reference_id = NEW.id;

  -- Field-sales consignment: Sales -> Outlet shelf.
  FOR item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(NEW.new_consignment_items, '[]'::jsonb))
  LOOP
    item_name := trim(item->>'name');
    qty := COALESCE((item->>'qty')::numeric, 0);

    IF item_name <> '' AND qty > 0 THEN
      SELECT p.id INTO product_id
      FROM public.products p
      WHERE p.user_id = NEW.user_id
        AND lower(p.name) = lower(item_name)
      LIMIT 1;

      IF product_id IS NOT NULL THEN
        INSERT INTO public.stock_movements(
          owner_id, product_id, movement_type,
          from_location_id, to_location_id, quantity,
          reference_type, reference_id, notes, occurred_at
        ) VALUES (
          NEW.user_id, product_id, 'transfer',
          sales_location_id, outlet_location_id, qty,
          'transaction', NEW.id, 'Field sales: konsinyasi Sales -> Outlet', NEW.created_at
        );
      END IF;
    END IF;
  END LOOP;

  -- Field-sales return: Outlet -> Sales.
  FOR item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb))
  LOOP
    item_name := trim(item->>'name');
    qty := COALESCE((item->>'returned')::numeric, 0);

    IF item_name <> '' AND qty > 0 THEN
      SELECT p.id INTO product_id
      FROM public.products p
      WHERE p.user_id = NEW.user_id
        AND lower(p.name) = lower(item_name)
      LIMIT 1;

      IF product_id IS NOT NULL THEN
        INSERT INTO public.stock_movements(
          owner_id, product_id, movement_type,
          from_location_id, to_location_id, quantity,
          reference_type, reference_id, notes, occurred_at
        ) VALUES (
          NEW.user_id, product_id, 'return_in',
          outlet_location_id, sales_location_id, qty,
          'transaction', NEW.id, 'Field sales: retur Outlet -> Sales', NEW.created_at
        );
      END IF;
    END IF;

    -- Field-sales direct sale: Sales -> outside business.
    IF NEW.transaction_type = 'Direct Sale' THEN
      qty := COALESCE((item->>'sold')::numeric, 0);

      IF item_name <> '' AND qty > 0 THEN
        SELECT p.id INTO product_id
        FROM public.products p
        WHERE p.user_id = NEW.user_id
          AND lower(p.name) = lower(item_name)
        LIMIT 1;

        IF product_id IS NOT NULL THEN
          INSERT INTO public.stock_movements(
            owner_id, product_id, movement_type,
            from_location_id, to_location_id, quantity,
            reference_type, reference_id, notes, occurred_at
          ) VALUES (
            NEW.user_id, product_id, 'sale',
            sales_location_id, NULL, qty,
            'transaction', NEW.id, 'Field sales: penjualan langsung dari Sales', NEW.created_at
          );
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
AFTER INSERT OR UPDATE OF line_items, new_consignment_items, transaction_type, sales_user_id, sales_name
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_transaction_stock_movements();

REVOKE ALL ON FUNCTION public.sync_transaction_stock_movements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_transaction_stock_movements() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Warehouse direct selling.
-- This is intentionally separate from outlet-visit transactions so warehouse
-- selling never masquerades as a field visit.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_direct_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  buyer_name text NOT NULL,
  buyer_outlet_id uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  sale_date timestamptz NOT NULL DEFAULT now(),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_sales numeric NOT NULL DEFAULT 0 CHECK (total_sales >= 0),
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  amount_paid numeric NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  custom_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warehouse_direct_sales_owner_date_idx
  ON public.warehouse_direct_sales(owner_id, sale_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS warehouse_direct_sales_receipt_uq
  ON public.warehouse_direct_sales(owner_id, receipt_number);

ALTER TABLE public.warehouse_direct_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business manages warehouse direct sales"
ON public.warehouse_direct_sales;

CREATE POLICY "business manages warehouse direct sales"
ON public.warehouse_direct_sales
FOR ALL TO authenticated
USING (owner_id = public.business_owner_id())
WITH CHECK (owner_id = public.business_owner_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_direct_sales TO authenticated;
GRANT ALL ON public.warehouse_direct_sales TO service_role;

CREATE OR REPLACE FUNCTION public.sync_warehouse_direct_sale_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  warehouse_id uuid;
  buyer_location_id uuid;
  item jsonb;
  item_name text;
  qty numeric;
  product_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_movements
    WHERE owner_id = OLD.owner_id
      AND reference_type = 'warehouse_direct_sale'
      AND reference_id = OLD.id;
    RETURN OLD;
  END IF;

  warehouse_id := public.ensure_stock_location(
    NEW.owner_id,
    'warehouse',
    'Gudang Utama'
  );

  buyer_location_id := NULL;
  IF NEW.buyer_outlet_id IS NOT NULL THEN
    buyer_location_id := public.ensure_stock_location(
      NEW.owner_id,
      'outlet',
      (SELECT o.name FROM public.outlets o WHERE o.id = NEW.buyer_outlet_id),
      NEW.buyer_outlet_id,
      NULL
    );
  END IF;

  DELETE FROM public.stock_movements
  WHERE owner_id = NEW.owner_id
    AND reference_type = 'warehouse_direct_sale'
    AND reference_id = NEW.id;

  -- Warehouse direct sale: Warehouse -> outside business.
  FOR item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb))
  LOOP
    item_name := trim(item->>'name');
    qty := COALESCE((item->>'qty')::numeric, 0);

    IF item_name <> '' AND qty > 0 THEN
      SELECT p.id INTO product_id
      FROM public.products p
      WHERE p.user_id = NEW.owner_id
        AND lower(p.name) = lower(item_name)
      LIMIT 1;

      IF product_id IS NOT NULL THEN
        INSERT INTO public.stock_movements(
          owner_id, product_id, movement_type,
          from_location_id, to_location_id, quantity,
          reference_type, reference_id, notes, occurred_at
        ) VALUES (
          NEW.owner_id, product_id, 'sale',
          warehouse_id, NULL, qty,
          'warehouse_direct_sale', NEW.id, 'Direct Selling Gudang', NEW.sale_date
        );
      END IF;
    END IF;
  END LOOP;

  -- Direct-sale return: Buyer Outlet -> Warehouse.
  IF buyer_location_id IS NOT NULL THEN
    FOR item IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(NEW.return_items, '[]'::jsonb))
    LOOP
      item_name := trim(item->>'name');
      qty := COALESCE((item->>'qty')::numeric, 0);

      IF item_name <> '' AND qty > 0 THEN
        SELECT p.id INTO product_id
        FROM public.products p
        WHERE p.user_id = NEW.owner_id
          AND lower(p.name) = lower(item_name)
        LIMIT 1;

        IF product_id IS NOT NULL THEN
          INSERT INTO public.stock_movements(
            owner_id, product_id, movement_type,
            from_location_id, to_location_id, quantity,
            reference_type, reference_id, notes, occurred_at
          ) VALUES (
            NEW.owner_id, product_id, 'return_in',
            buyer_location_id, warehouse_id, qty,
            'warehouse_direct_sale', NEW.id, 'Retur Direct Selling Gudang -> Gudang', NEW.sale_date
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_warehouse_direct_sale_stock_after_write
ON public.warehouse_direct_sales;

CREATE TRIGGER sync_warehouse_direct_sale_stock_after_write
AFTER INSERT OR UPDATE OR DELETE
ON public.warehouse_direct_sales
FOR EACH ROW
EXECUTE FUNCTION public.sync_warehouse_direct_sale_stock();

REVOKE ALL ON FUNCTION public.sync_warehouse_direct_sale_stock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_warehouse_direct_sale_stock() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
