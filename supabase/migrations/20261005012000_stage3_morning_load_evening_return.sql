-- Stage 3: Morning load and evening return.
-- Warehouse -> Sales in the morning.
-- Sales -> Warehouse at day close.
-- All stock changes remain in stock_movements.

CREATE TABLE IF NOT EXISTS public.sales_stock_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sales_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sales_location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  stock_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, sales_user_id, stock_date)
);

CREATE TABLE IF NOT EXISTS public.sales_stock_day_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id uuid NOT NULL REFERENCES public.sales_stock_days(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_id, product_id)
);

CREATE INDEX IF NOT EXISTS sales_stock_days_owner_date_idx
  ON public.sales_stock_days(owner_id, stock_date DESC);
CREATE INDEX IF NOT EXISTS sales_stock_day_loads_day_idx
  ON public.sales_stock_day_loads(day_id);

ALTER TABLE public.sales_stock_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_stock_day_loads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business manages sales stock days" ON public.sales_stock_days;
CREATE POLICY "business manages sales stock days"
ON public.sales_stock_days FOR ALL TO authenticated
USING (owner_id = public.business_owner_id())
WITH CHECK (owner_id = public.business_owner_id());

DROP POLICY IF EXISTS "business manages sales stock loads" ON public.sales_stock_day_loads;
CREATE POLICY "business manages sales stock loads"
ON public.sales_stock_day_loads FOR ALL TO authenticated
USING (owner_id = public.business_owner_id())
WITH CHECK (owner_id = public.business_owner_id());

CREATE OR REPLACE FUNCTION public.sales_location_balance(
  _owner_id uuid,
  _sales_location_id uuid,
  _product_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT SUM(soi.quantity)
    FROM public.stock_opening_items soi
    WHERE soi.owner_id = _owner_id
      AND soi.location_id = _sales_location_id
      AND soi.product_id = _product_id
  ), 0)
  + COALESCE((
    SELECT SUM(sm.quantity)
    FROM public.stock_movements sm
    WHERE sm.owner_id = _owner_id
      AND sm.to_location_id = _sales_location_id
      AND sm.product_id = _product_id
  ), 0)
  - COALESCE((
    SELECT SUM(sm.quantity)
    FROM public.stock_movements sm
    WHERE sm.owner_id = _owner_id
      AND sm.from_location_id = _sales_location_id
      AND sm.product_id = _product_id
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.record_sales_morning_load(
  _sales_user_id uuid,
  _items jsonb,
  _stock_date date DEFAULT CURRENT_DATE,
  _occurred_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    INSERT INTO public.sales_stock_days (
      owner_id, sales_user_id, sales_location_id, stock_date
    ) VALUES (
      _owner_id, _sales_user_id, _sales_location_id, _stock_date
    ) RETURNING id INTO _day_id;
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
      RAISE EXCEPTION 'Muatan pagi untuk Sales dan tanggal ini sudah dicatat.';
    END IF;
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Minimal satu produk harus dimuat ke Sales.';
  END IF;

  FOR _item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    _product_id := (_item->>'product_id')::uuid;
    _quantity := COALESCE((_item->>'quantity')::numeric, 0);

    IF _quantity <= 0 THEN
      RAISE EXCEPTION 'Jumlah muatan harus lebih dari 0.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = _product_id AND p.user_id = _owner_id
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

    INSERT INTO public.stock_movements (
      owner_id, product_id, movement_type,
      from_location_id, to_location_id, quantity,
      reference_type, reference_id, occurred_at, notes
    ) VALUES (
      _owner_id, _product_id, 'transfer',
      _warehouse_location_id, _sales_location_id, _quantity,
      'sales_stock_day_load', _day_id, _occurred_at,
      'Morning load Gudang Utama -> Sales'
    ) RETURNING id INTO _movement_id;

    INSERT INTO public.sales_stock_day_loads (
      day_id, owner_id, product_id, quantity, movement_id
    ) VALUES (
      _day_id, _owner_id, _product_id, _quantity, _movement_id
    );
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
SET search_path = public
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

  IF _day.id IS NULL THEN
    RAISE EXCEPTION 'Belum ada muatan pagi untuk Sales ini.';
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
    SELECT DISTINCT p.id
    FROM public.products p
    WHERE p.user_id = _owner_id
      AND EXISTS (
        SELECT 1
        FROM public.stock_movements sm
        WHERE sm.owner_id = _owner_id
          AND sm.product_id = p.id
          AND (sm.from_location_id = _day.sales_location_id OR sm.to_location_id = _day.sales_location_id)
      )
  LOOP
    _balance := public.sales_location_balance(_owner_id, _day.sales_location_id, _product_id);

    IF _balance < 0 THEN
      RAISE EXCEPTION 'Saldo stok Sales negatif untuk produk %.', _product_id;
    END IF;

    IF _balance > 0 THEN
      INSERT INTO public.stock_movements (
        owner_id, product_id, movement_type,
        from_location_id, to_location_id, quantity,
        reference_type, reference_id, occurred_at, notes
      ) VALUES (
        _owner_id, _product_id, 'transfer',
        _day.sales_location_id, _warehouse_location_id, _balance,
        'sales_stock_day_close', _day.id, _occurred_at,
        'Evening return Sales -> Gudang Utama'
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
GRANT EXECUTE ON FUNCTION public.sales_location_balance(uuid, uuid, uuid) TO authenticated;

GRANT ALL ON public.sales_stock_days TO service_role;
GRANT ALL ON public.sales_stock_day_loads TO service_role;

NOTIFY pgrst, 'reload schema';
