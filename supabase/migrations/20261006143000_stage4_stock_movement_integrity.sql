-- Stage 4: stock movement/backend integrity hardening.
-- Scope:
-- 1) Ensure Sales stock locations can be resolved/created by the common helper.
-- 2) Prevent cross-business product/location references in stock_movements.
-- 3) Serialize Sales loading/settlement and field transaction stock changes per product.
-- No UI changes and no change to the stock movement model.

-- -----------------------------------------------------------------------------
-- 1. Complete the common stock-location resolver.
-- -----------------------------------------------------------------------------
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
SET search_path = public, pg_temp
AS $$
DECLARE
  location_id uuid;
  member_owner uuid;
BEGIN
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Owner bisnis wajib diisi.';
  END IF;

  IF _location_type = 'warehouse' THEN
    SELECT sl.id INTO location_id
    FROM public.stock_locations sl
    WHERE sl.owner_id = _owner_id
      AND sl.location_type = 'warehouse'
    ORDER BY sl.created_at
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name)
      VALUES (_owner_id, 'warehouse', COALESCE(NULLIF(trim(_name), ''), 'Gudang Utama'))
      RETURNING id INTO location_id;
    END IF;

  ELSIF _location_type = 'outlet' THEN
    IF _outlet_id IS NULL THEN
      RAISE EXCEPTION 'Outlet wajib diisi untuk lokasi outlet.';
    END IF;

    SELECT sl.id INTO location_id
    FROM public.stock_locations sl
    WHERE sl.owner_id = _owner_id
      AND sl.location_type = 'outlet'
      AND sl.outlet_id = _outlet_id
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name, outlet_id)
      VALUES (_owner_id, 'outlet', COALESCE(NULLIF(trim(_name), ''), 'Outlet'), _outlet_id)
      RETURNING id INTO location_id;
    END IF;

  ELSIF _location_type = 'sales' THEN
    IF _team_member_user_id IS NULL THEN
      RAISE EXCEPTION 'Sales wajib diisi untuk lokasi Sales.';
    END IF;

    SELECT tm.owner_id INTO member_owner
    FROM public.team_members tm
    WHERE tm.user_id = _team_member_user_id
    LIMIT 1;

    IF member_owner IS DISTINCT FROM _owner_id THEN
      RAISE EXCEPTION 'Sales bukan anggota bisnis ini.';
    END IF;

    SELECT sl.id INTO location_id
    FROM public.stock_locations sl
    WHERE sl.owner_id = _owner_id
      AND sl.location_type = 'sales'
      AND sl.team_member_user_id = _team_member_user_id
    LIMIT 1;

    IF location_id IS NULL THEN
      INSERT INTO public.stock_locations(owner_id, location_type, name, team_member_user_id)
      VALUES (
        _owner_id,
        'sales',
        COALESCE(NULLIF(trim(_name), ''), 'Sales'),
        _team_member_user_id
      )
      RETURNING id INTO location_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipe lokasi stok tidak valid: %', _location_type;
  END IF;

  RETURN location_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Stock movement ownership/reference integrity.
-- RLS protects rows by owner_id, but foreign-key ownership is not enforced by
-- the database. This trigger closes that gap without changing valid movements.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_stock_movement_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  product_owner uuid;
  from_owner uuid;
  to_owner uuid;
  reference_owner uuid;
BEGIN
  SELECT p.user_id INTO product_owner
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF product_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Produk stok bukan milik bisnis ini.';
  END IF;

  IF NEW.from_location_id IS NOT NULL THEN
    SELECT sl.owner_id INTO from_owner
    FROM public.stock_locations sl
    WHERE sl.id = NEW.from_location_id;

    IF from_owner IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Lokasi asal stok bukan milik bisnis ini.';
    END IF;
  END IF;

  IF NEW.to_location_id IS NOT NULL THEN
    SELECT sl.owner_id INTO to_owner
    FROM public.stock_locations sl
    WHERE sl.id = NEW.to_location_id;

    IF to_owner IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Lokasi tujuan stok bukan milik bisnis ini.';
    END IF;
  END IF;

  IF NEW.reference_id IS NOT NULL THEN
    IF NEW.reference_type = 'transaction' THEN
      SELECT t.user_id INTO reference_owner
      FROM public.transactions t
      WHERE t.id = NEW.reference_id;
    ELSIF NEW.reference_type = 'warehouse_direct_sale' THEN
      SELECT wds.owner_id INTO reference_owner
      FROM public.warehouse_direct_sales wds
      WHERE wds.id = NEW.reference_id;
    ELSIF NEW.reference_type = 'opening_stock' THEN
      SELECT soi.owner_id INTO reference_owner
      FROM public.stock_opening_items soi
      WHERE soi.id = NEW.reference_id;
    ELSIF NEW.reference_type IN ('sales_stock_day_load', 'sales_stock_day_close') THEN
      SELECT ssd.owner_id INTO reference_owner
      FROM public.sales_stock_days ssd
      WHERE ssd.id = NEW.reference_id;
    END IF;

    IF reference_owner IS NOT NULL AND reference_owner IS DISTINCT FROM NEW.owner_id THEN
      RAISE EXCEPTION 'Referensi pergerakan stok bukan milik bisnis ini.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_stock_movement_integrity_before_write
ON public.stock_movements;

CREATE TRIGGER validate_stock_movement_integrity_before_write
BEFORE INSERT OR UPDATE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.validate_stock_movement_integrity();

-- -----------------------------------------------------------------------------
-- 3. Shared per-owner/product transaction lock.
-- PostgreSQL transaction-level advisory locks are released automatically when
-- the transaction ends. The same key is used by Sales load, Sales settlement,
-- and field-transaction stock synchronization.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_stock_product(_owner_id uuid, _product_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended(_owner_id::text || ':' || _product_id::text, 0)
  );
$$;

REVOKE ALL ON FUNCTION public.lock_stock_product(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_stock_product(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Lock products before field transactions rebuild their stock movements.
-- This runs before the existing AFTER trigger that writes stock_movements.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_transaction_stock_resources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item jsonb;
  item_name text;
  product_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(OLD.line_items, '[]'::jsonb))
    LOOP
      item_name := lower(trim(item->>'name'));
      IF item_name <> '' THEN
        SELECT p.id INTO product_id
        FROM public.products p
        WHERE p.user_id = OLD.user_id
          AND lower(p.name) = item_name
        ORDER BY p.id
        LIMIT 1;
        IF product_id IS NOT NULL THEN
          PERFORM public.lock_stock_product(OLD.user_id, product_id);
        END IF;
      END IF;
    END LOOP;

    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(OLD.new_consignment_items, '[]'::jsonb))
    LOOP
      item_name := lower(trim(item->>'name'));
      IF item_name <> '' THEN
        SELECT p.id INTO product_id
        FROM public.products p
        WHERE p.user_id = OLD.user_id
          AND lower(p.name) = item_name
        ORDER BY p.id
        LIMIT 1;
        IF product_id IS NOT NULL THEN
          PERFORM public.lock_stock_product(OLD.user_id, product_id);
        END IF;
      END IF;
    END LOOP;

    RETURN OLD;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb))
  LOOP
    item_name := lower(trim(item->>'name'));
    IF item_name <> '' THEN
      SELECT p.id INTO product_id
      FROM public.products p
      WHERE p.user_id = NEW.user_id
        AND lower(p.name) = item_name
      ORDER BY p.id
      LIMIT 1;
      IF product_id IS NOT NULL THEN
        PERFORM public.lock_stock_product(NEW.user_id, product_id);
      END IF;
    END IF;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.new_consignment_items, '[]'::jsonb))
  LOOP
    item_name := lower(trim(item->>'name'));
    IF item_name <> '' THEN
      SELECT p.id INTO product_id
      FROM public.products p
      WHERE p.user_id = NEW.user_id
        AND lower(p.name) = item_name
      ORDER BY p.id
      LIMIT 1;
      IF product_id IS NOT NULL THEN
        PERFORM public.lock_stock_product(NEW.user_id, product_id);
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_transaction_stock_resources_before_write
ON public.transactions;

CREATE TRIGGER lock_transaction_stock_resources_before_write
BEFORE INSERT OR UPDATE OF line_items, new_consignment_items, transaction_type, sales_user_id, sales_name, stock_source OR DELETE
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.lock_transaction_stock_resources();

-- -----------------------------------------------------------------------------
-- 5. Replace the Sales load/settlement functions with the same product lock.
-- The business rules remain unchanged; only concurrent balance reads are made
-- serialized with other stock-changing operations using the same lock key.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_sales_morning_load(
  _sales_user_id uuid,
  _items jsonb,
  _stock_date date DEFAULT CURRENT_DATE,
  _occurred_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _owner_id uuid;
  _sales_location_id uuid;
  _warehouse_location_id uuid;
  _day_id uuid;
  _item jsonb;
  _product_id uuid;
  _quantity numeric;
  _warehouse_balance numeric;
  _movement_id uuid;
BEGIN
  _owner_id := public.business_owner_id();
  IF _owner_id IS NULL THEN RAISE EXCEPTION 'Bisnis tidak ditemukan.'; END IF;
  IF _sales_user_id IS NULL THEN RAISE EXCEPTION 'Sales wajib dipilih.'; END IF;

  SELECT sl.id INTO _sales_location_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = _owner_id
    AND sl.location_type = 'sales'
    AND sl.team_member_user_id = _sales_user_id
    AND sl.is_active = true
  LIMIT 1;
  IF _sales_location_id IS NULL THEN RAISE EXCEPTION 'Lokasi stok Sales belum terdaftar.'; END IF;

  SELECT sl.id INTO _warehouse_location_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = _owner_id
    AND sl.location_type = 'warehouse'
    AND sl.is_active = true
  ORDER BY sl.created_at
  LIMIT 1;
  IF _warehouse_location_id IS NULL THEN RAISE EXCEPTION 'Gudang Utama belum terdaftar.'; END IF;

  SELECT id INTO _day_id
  FROM public.sales_stock_days
  WHERE owner_id = _owner_id
    AND sales_user_id = _sales_user_id
    AND stock_date = _stock_date
  FOR UPDATE;

  IF _day_id IS NULL THEN
    INSERT INTO public.sales_stock_days(owner_id, sales_user_id, sales_location_id, stock_date)
    VALUES (_owner_id, _sales_user_id, _sales_location_id, _stock_date)
    RETURNING id INTO _day_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.sales_stock_days WHERE id = _day_id AND status = 'closed') THEN
      RAISE EXCEPTION 'Hari stok Sales sudah ditutup.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sales_stock_day_loads WHERE day_id = _day_id) THEN
      RAISE EXCEPTION 'Loading Sales untuk tanggal ini sudah dicatat.';
    END IF;
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Minimal satu produk harus dimuat ke Sales.';
  END IF;

  FOR _item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    _product_id := (_item->>'product_id')::uuid;
    _quantity := COALESCE((_item->>'quantity')::numeric, 0);
    IF _quantity <= 0 THEN RAISE EXCEPTION 'Jumlah loading harus lebih dari 0.'; END IF;

    PERFORM public.lock_stock_product(_owner_id, _product_id);

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = _product_id AND p.user_id = _owner_id
    ) THEN
      RAISE EXCEPTION 'Produk bukan milik bisnis ini.';
    END IF;

    _warehouse_balance := COALESCE((
      SELECT SUM(soi.quantity) FROM public.stock_opening_items soi
      WHERE soi.owner_id = _owner_id
        AND soi.location_id = _warehouse_location_id
        AND soi.product_id = _product_id
    ), 0)
    + COALESCE((
      SELECT SUM(sm.quantity) FROM public.stock_movements sm
      WHERE sm.owner_id = _owner_id
        AND sm.to_location_id = _warehouse_location_id
        AND sm.product_id = _product_id
    ), 0)
    - COALESCE((
      SELECT SUM(sm.quantity) FROM public.stock_movements sm
      WHERE sm.owner_id = _owner_id
        AND sm.from_location_id = _warehouse_location_id
        AND sm.product_id = _product_id
    ), 0);

    IF _warehouse_balance < _quantity THEN
      RAISE EXCEPTION 'Stok gudang tidak cukup untuk %.', _quantity;
    END IF;

    INSERT INTO public.stock_movements(
      owner_id, product_id, movement_type,
      from_location_id, to_location_id, quantity,
      reference_type, reference_id, occurred_at, notes
    ) VALUES (
      _owner_id, _product_id, 'transfer',
      _warehouse_location_id, _sales_location_id, _quantity,
      'sales_stock_day_load', _day_id, _occurred_at,
      'Loading Gudang Utama -> Sales'
    ) RETURNING id INTO _movement_id;

    INSERT INTO public.sales_stock_day_loads(day_id, owner_id, product_id, quantity, movement_id)
    VALUES (_day_id, _owner_id, _product_id, _quantity, _movement_id);
  END LOOP;

  RETURN _day_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_sales_stock_day(
  _sales_user_id uuid,
  _stock_date date DEFAULT CURRENT_DATE,
  _occurred_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _owner_id uuid;
  _day public.sales_stock_days%ROWTYPE;
  _warehouse_location_id uuid;
  _product_id uuid;
  _balance numeric;
BEGIN
  _owner_id := public.business_owner_id();

  SELECT * INTO _day
  FROM public.sales_stock_days
  WHERE owner_id = _owner_id
    AND sales_user_id = _sales_user_id
    AND stock_date = _stock_date
  FOR UPDATE;

  IF _day.id IS NULL THEN RAISE EXCEPTION 'Belum ada Loading Sales untuk tanggal ini.'; END IF;
  IF _day.status = 'closed' THEN RETURN _day.id; END IF;

  SELECT sl.id INTO _warehouse_location_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = _owner_id
    AND sl.location_type = 'warehouse'
    AND sl.is_active = true
  ORDER BY sl.created_at
  LIMIT 1;
  IF _warehouse_location_id IS NULL THEN RAISE EXCEPTION 'Gudang Utama belum terdaftar.'; END IF;

  FOR _product_id IN
    SELECT DISTINCT p.id
    FROM public.products p
    WHERE p.user_id = _owner_id
      AND EXISTS (
        SELECT 1 FROM public.stock_movements sm
        WHERE sm.owner_id = _owner_id
          AND sm.product_id = p.id
          AND (sm.from_location_id = _day.sales_location_id OR sm.to_location_id = _day.sales_location_id)
      )
    ORDER BY p.id
  LOOP
    PERFORM public.lock_stock_product(_owner_id, _product_id);

    _balance := public.sales_location_balance(_owner_id, _day.sales_location_id, _product_id);
    IF _balance < 0 THEN RAISE EXCEPTION 'Saldo stok Sales negatif untuk produk %.', _product_id; END IF;

    IF _balance > 0 THEN
      INSERT INTO public.stock_movements(
        owner_id, product_id, movement_type,
        from_location_id, to_location_id, quantity,
        reference_type, reference_id, occurred_at, notes
      ) VALUES (
        _owner_id, _product_id, 'transfer',
        _day.sales_location_id, _warehouse_location_id, _balance,
        'sales_stock_day_close', _day.id, _occurred_at,
        'Setoran Sales -> Gudang Utama'
      );
    END IF;
  END LOOP;

  UPDATE public.sales_stock_days
  SET status = 'closed', closed_at = _occurred_at
  WHERE id = _day.id;

  RETURN _day.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sales_morning_load(uuid, jsonb, date, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_sales_stock_day(uuid, date, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
