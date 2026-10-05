-- Finalize Migration + Field Stock Flow semantics.
--
-- Business rules:
-- 1. Migration opening is a distributed physical snapshot. Opening quantities
--    at Warehouse and Outlet are independent and are NOT transfers.
-- 2. After migration opening is finalized, physical stock moves through the
--    ledger only.
-- 3. Warehouse -> Sales = stock loaded to a Sales person before a visit.
-- 4. Sales -> Outlet = stock becomes consigned to the outlet when the visit
--    note/transaction is issued.
-- 5. If no note is issued, the stock remains with Sales.
-- 6. Outlet -> Sales = goods returned by the outlet during the visit.
-- 7. Sales -> Warehouse = remaining/returned goods brought back at closing.
-- 8. A stock movement may never make a location's balance negative.
--
-- The existing transaction trigger already represents a consignment note as
-- Sales -> Outlet and an outlet return as Outlet -> Sales. This migration adds
-- the missing load/closing operations and a database-level non-negative guard.

-- -----------------------------------------------------------------------------
-- 1. Location balance helper.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_location_balance(
  p_owner_id uuid,
  p_location_id uuid,
  p_product_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(soi.quantity)
      FROM public.stock_opening_items soi
      WHERE soi.owner_id = p_owner_id
        AND soi.location_id = p_location_id
        AND soi.product_id = p_product_id
    ), 0)
    + COALESCE((
      SELECT SUM(sm.quantity)
      FROM public.stock_movements sm
      WHERE sm.owner_id = p_owner_id
        AND sm.to_location_id = p_location_id
        AND sm.product_id = p_product_id
    ), 0)
    - COALESCE((
      SELECT SUM(sm.quantity)
      FROM public.stock_movements sm
      WHERE sm.owner_id = p_owner_id
        AND sm.from_location_id = p_location_id
        AND sm.product_id = p_product_id
    ), 0);
$$;

REVOKE ALL ON FUNCTION public.stock_location_balance(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_location_balance(uuid, uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Prevent negative physical stock at the source location.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_stock_movement_source_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  available numeric;
BEGIN
  IF NEW.from_location_id IS NULL OR NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;

  available := public.stock_location_balance(
    NEW.owner_id,
    NEW.from_location_id,
    NEW.product_id
  );

  IF available < NEW.quantity THEN
    RAISE EXCEPTION
      'Stok tidak cukup di lokasi sumber. Tersedia %, diminta %.',
      available, NEW.quantity
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_stock_movement_source_balance_before_insert
ON public.stock_movements;

CREATE TRIGGER validate_stock_movement_source_balance_before_insert
BEFORE INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.validate_stock_movement_source_balance();

REVOKE ALL ON FUNCTION public.validate_stock_movement_source_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_stock_movement_source_balance() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Load stock from Warehouse to a Sales person.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.load_stock_to_sales(
  p_sales_user_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_reference_type text DEFAULT 'sales_load',
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := public.business_owner_id();
  v_warehouse_id uuid;
  v_sales_location_id uuid;
  v_movement_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Jumlah load harus lebih dari 0.' USING ERRCODE = '22023';
  END IF;

  IF p_sales_user_id IS NULL THEN
    RAISE EXCEPTION 'Sales wajib dipilih.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.owner_id = v_owner_id
      AND tm.user_id = p_sales_user_id
      AND lower(tm.position) = 'sales'
  ) THEN
    RAISE EXCEPTION 'User yang dipilih bukan Sales aktif untuk usaha ini.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.user_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'Produk tidak valid untuk usaha ini.' USING ERRCODE = '42501';
  END IF;

  v_warehouse_id := public.ensure_stock_location(v_owner_id, 'warehouse', 'Gudang Utama');
  v_sales_location_id := public.ensure_stock_location(
    v_owner_id,
    'sales',
    'Sales ' || left(p_sales_user_id::text, 6),
    NULL,
    p_sales_user_id
  );

  INSERT INTO public.stock_movements(
    owner_id,
    product_id,
    movement_type,
    from_location_id,
    to_location_id,
    quantity,
    reference_type,
    reference_id,
    notes,
    occurred_at
  ) VALUES (
    v_owner_id,
    p_product_id,
    'transfer',
    v_warehouse_id,
    v_sales_location_id,
    p_quantity,
    p_reference_type,
    p_reference_id,
    COALESCE(p_notes, 'Load Gudang -> Sales'),
    now()
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.load_stock_to_sales(uuid, uuid, numeric, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_stock_to_sales(uuid, uuid, numeric, text, uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Close a Sales stock position back to Warehouse.
--    This is used for remaining goods + physical returns carried back.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_sales_stock_to_warehouse(
  p_sales_user_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_reference_type text DEFAULT 'sales_closing',
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := public.business_owner_id();
  v_warehouse_id uuid;
  v_sales_location_id uuid;
  v_movement_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Jumlah pengembalian harus lebih dari 0.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.owner_id = v_owner_id
      AND tm.user_id = p_sales_user_id
      AND lower(tm.position) = 'sales'
  ) THEN
    RAISE EXCEPTION 'User yang dipilih bukan Sales aktif untuk usaha ini.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.user_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'Produk tidak valid untuk usaha ini.' USING ERRCODE = '42501';
  END IF;

  v_warehouse_id := public.ensure_stock_location(v_owner_id, 'warehouse', 'Gudang Utama');
  v_sales_location_id := public.ensure_stock_location(
    v_owner_id,
    'sales',
    'Sales ' || left(p_sales_user_id::text, 6),
    NULL,
    p_sales_user_id
  );

  INSERT INTO public.stock_movements(
    owner_id,
    product_id,
    movement_type,
    from_location_id,
    to_location_id,
    quantity,
    reference_type,
    reference_id,
    notes,
    occurred_at
  ) VALUES (
    v_owner_id,
    p_product_id,
    'return_in',
    v_sales_location_id,
    v_warehouse_id,
    p_quantity,
    p_reference_type,
    p_reference_id,
    COALESCE(p_notes, 'Closing Sales -> Gudang'),
    now()
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.return_sales_stock_to_warehouse(uuid, uuid, numeric, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_sales_stock_to_warehouse(uuid, uuid, numeric, text, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
