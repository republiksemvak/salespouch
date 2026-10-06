-- Stage 4 correction: deterministic stock locking + complete Sales settlement sweep.
-- Apply after 20261006143000_stage4_stock_movement_integrity.sql.
-- This migration does not change the stock model or UI.

-- -----------------------------------------------------------------------------
-- 1. Lock transaction products in deterministic UUID order.
-- Prevents opposite lock ordering between concurrent multi-product transactions.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_transaction_stock_resources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _owner_id uuid;
  _line_items jsonb;
  _consignment_items jsonb;
  _product_id uuid;
BEGIN
  _owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  _line_items := CASE WHEN TG_OP = 'DELETE' THEN OLD.line_items ELSE NEW.line_items END;
  _consignment_items := CASE WHEN TG_OP = 'DELETE' THEN OLD.new_consignment_items ELSE NEW.new_consignment_items END;

  FOR _product_id IN
    SELECT p.id
    FROM public.products p
    JOIN (
      SELECT DISTINCT lower(trim(value->>'name')) AS product_name
      FROM jsonb_array_elements(COALESCE(_line_items, '[]'::jsonb))
      WHERE trim(value->>'name') <> ''
      UNION
      SELECT DISTINCT lower(trim(value->>'name')) AS product_name
      FROM jsonb_array_elements(COALESCE(_consignment_items, '[]'::jsonb))
      WHERE trim(value->>'name') <> ''
    ) item_names ON lower(p.name) = item_names.product_name
    WHERE p.user_id = _owner_id
    ORDER BY p.id
  LOOP
    PERFORM public.lock_stock_product(_owner_id, _product_id);
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
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
-- 2. Lock Sales-loading products in deterministic UUID order.
-- The business logic is unchanged; only the lock acquisition order is fixed.
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
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan.';
  END IF;

  IF _sales_user_id IS NULL THEN
    RAISE EXCEPTION 'Sales wajib dipilih.';
  END IF;

  SELECT sl.id INTO _sales_location_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = _owner_id
    AND sl.location_type = 'sales'
    AND sl.team_member_user_id = _sales_user_id
    AND sl.is_active = true
  LIMIT 1;

  IF _sales_location_id IS NULL THEN
    RAISE EXCEPTION 'Lokasi stok Sales belum terdaftar.';
  END IF;

  SELECT sl.id INTO _warehouse_location_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = _owner_id
    AND sl.location_type = 'warehouse'
    AND sl.is_active = true
  ORDER BY sl.created_at
  LIMIT 1;

  IF _warehouse_location_id IS NULL THEN
    RAISE EXCEPTION 'Gudang Utama belum terdaftar.';
  END IF;

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
    IF EXISTS (
      SELECT 1 FROM public.sales_stock_days
      WHERE id = _day_id AND status = 'closed'
    ) THEN
      RAISE EXCEPTION 'Hari stok Sales sudah ditutup.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.sales_stock_day_loads
      WHERE day_id = _day_id
    ) THEN
      RAISE EXCEPTION 'Loading Sales untuk tanggal ini sudah dicatat.';
    END IF;
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Minimal satu produk harus dimuat ke Sales.';
  END IF;

  -- IMPORTANT: sort by product UUID before taking advisory locks.
  FOR _item IN
    SELECT value
    FROM jsonb_array_elements(_items)
    ORDER BY (value->>'product_id')::uuid
  LOOP
    _product_id := (_item->>'product_id')::uuid;
    _quantity := COALESCE((_item->>'quantity')::numeric, 0);

    IF _quantity <= 0 THEN
      RAISE EXCEPTION 'Jumlah loading harus lebih dari 0.';
    END IF;

    PERFORM public.lock_stock_product(_owner_id, _product_id);

    IF NOT EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = _product_id
        AND p.user_id = _owner_id
    ) THEN
      RAISE EXCEPTION 'Produk bukan milik bisnis ini.';
    END IF;

    _warehouse_balance := COALESCE((
      SELECT SUM(soi.quantity)
      FROM public.stock_opening_items soi
      WHERE soi.owner_id = _owner_id
        AND soi.location_id = _warehouse_location_id
        AND soi.product_id = _product_id
    ), 0)
    + COALESCE((
      SELECT SUM(sm.quantity)
      FROM public.stock_movements sm
      WHERE sm.owner_id = _owner_id
        AND sm.to_location_id = _warehouse_location_id
        AND sm.product_id = _product_id
    ), 0)
    - COALESCE((
      SELECT SUM(sm.quantity)
      FROM public.stock_movements sm
      WHERE sm.owner_id = _owner_id
        AND sm.from_location_id = _warehouse_location_id
        AND sm.product_id = _product_id
    ), 0);

    IF _warehouse_balance < _quantity THEN
      RAISE EXCEPTION 'Stok gudang tidak cukup untuk %.', _quantity;
    END IF;

    INSERT INTO public.stock_movements(
      owner_id,
      product_id,
      movement_type,
      from_location_id,
      to_location_id,
      quantity,
      reference_type,
      reference_id,
      occurred_at,
      notes
    ) VALUES (
      _owner_id,
      _product_id,
      'transfer',
      _warehouse_location_id,
      _sales_location_id,
      _quantity,
      'sales_stock_day_load',
      _day_id,
      _occurred_at,
      'Loading Gudang Utama -> Sales'
    )
    RETURNING id INTO _movement_id;

    INSERT INTO public.sales_stock_day_loads(
      day_id,
      owner_id,
      product_id,
      quantity,
      movement_id
    ) VALUES (
      _day_id,
      _owner_id,
      _product_id,
      _quantity,
      _movement_id
    );
  END LOOP;

  RETURN _day_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sales_morning_load(uuid, jsonb, date, timestamptz)
TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Sales settlement must include opening stock as well as movements.
-- Without this, Sales opening stock with no later movement could be omitted.
-- -----------------------------------------------------------------------------
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
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan.';
  END IF;

  SELECT * INTO _day
  FROM public.sales_stock_days
  WHERE owner_id = _owner_id
    AND sales_user_id = _sales_user_id
    AND stock_date = _stock_date
  FOR UPDATE;

  IF _day.id IS NULL THEN
    RAISE EXCEPTION 'Belum ada Loading Sales untuk tanggal ini.';
  END IF;

  IF _day.status = 'closed' THEN
    RETURN _day.id;
  END IF;

  SELECT sl.id INTO _warehouse_location_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = _owner_id
    AND sl.location_type = 'warehouse'
    AND sl.is_active = true
  ORDER BY sl.created_at
  LIMIT 1;

  IF _warehouse_location_id IS NULL THEN
    RAISE EXCEPTION 'Gudang Utama belum terdaftar.';
  END IF;

  FOR _product_id IN
    SELECT DISTINCT x.product_id
    FROM (
      SELECT soi.product_id
      FROM public.stock_opening_items soi
      WHERE soi.owner_id = _owner_id
        AND soi.location_id = _day.sales_location_id

      UNION

      SELECT sm.product_id
      FROM public.stock_movements sm
      WHERE sm.owner_id = _owner_id
        AND (
          sm.from_location_id = _day.sales_location_id
          OR sm.to_location_id = _day.sales_location_id
        )
    ) x
    ORDER BY x.product_id
  LOOP
    PERFORM public.lock_stock_product(_owner_id, _product_id);

    _balance := COALESCE((
      SELECT SUM(soi.quantity)
      FROM public.stock_opening_items soi
      WHERE soi.owner_id = _owner_id
        AND soi.location_id = _day.sales_location_id
        AND soi.product_id = _product_id
    ), 0)
    + COALESCE((
      SELECT SUM(sm.quantity)
      FROM public.stock_movements sm
      WHERE sm.owner_id = _owner_id
        AND sm.to_location_id = _day.sales_location_id
        AND sm.product_id = _product_id
    ), 0)
    - COALESCE((
      SELECT SUM(sm.quantity)
      FROM public.stock_movements sm
      WHERE sm.owner_id = _owner_id
        AND sm.from_location_id = _day.sales_location_id
        AND sm.product_id = _product_id
    ), 0);

    IF _balance > 0 THEN
      INSERT INTO public.stock_movements(
        owner_id,
        product_id,
        movement_type,
        from_location_id,
        to_location_id,
        quantity,
        reference_type,
        reference_id,
        occurred_at,
        notes
      ) VALUES (
        _owner_id,
        _product_id,
        'transfer',
        _day.sales_location_id,
        _warehouse_location_id,
        _balance,
        'sales_stock_day_close',
        _day.id,
        _occurred_at,
        'Setoran Sales -> Gudang Utama'
      );
    END IF;
  END LOOP;

  UPDATE public.sales_stock_days
  SET status = 'closed',
      closed_at = _occurred_at
  WHERE id = _day.id;

  RETURN _day.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_sales_stock_day(uuid, date, timestamptz)
TO authenticated;

NOTIFY pgrst, 'reload schema';
