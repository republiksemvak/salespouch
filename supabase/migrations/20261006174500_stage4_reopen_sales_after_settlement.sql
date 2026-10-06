-- Stage 4: settlement is not a final Sales day close.
-- Preserve the existing stock-transfer logic, but reopen legacy closed days
-- before loading and after settlement so multiple cycles work on one date.

ALTER TABLE public.sales_stock_day_loads
  DROP CONSTRAINT IF EXISTS sales_stock_day_loads_day_id_product_id_key;

ALTER FUNCTION public.record_sales_morning_load(uuid, jsonb, date, timestamptz)
  RENAME TO record_sales_morning_load_legacy;

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
  _day_id uuid;
BEGIN
  _owner_id := public.business_owner_id();
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan.';
  END IF;

  SELECT id INTO _day_id
  FROM public.sales_stock_days
  WHERE owner_id = _owner_id
    AND sales_user_id = _sales_user_id
    AND stock_date = _stock_date
  FOR UPDATE;

  IF _day_id IS NOT NULL THEN
    UPDATE public.sales_stock_days
    SET status = 'open', closed_at = NULL
    WHERE id = _day_id;
  END IF;

  RETURN public.record_sales_morning_load_legacy(
    _sales_user_id,
    _items,
    _stock_date,
    _occurred_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sales_morning_load(uuid, jsonb, date, timestamptz)
TO authenticated;

ALTER FUNCTION public.close_sales_stock_day(uuid, date, timestamptz)
  RENAME TO close_sales_stock_day_legacy;

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
  _day_id uuid;
  _result uuid;
BEGIN
  _owner_id := public.business_owner_id();
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan.';
  END IF;

  SELECT id INTO _day_id
  FROM public.sales_stock_days
  WHERE owner_id = _owner_id
    AND sales_user_id = _sales_user_id
    AND stock_date = _stock_date
  FOR UPDATE;

  IF _day_id IS NULL THEN
    RAISE EXCEPTION 'Belum ada Loading Sales untuk tanggal ini.';
  END IF;

  UPDATE public.sales_stock_days
  SET status = 'open', closed_at = NULL
  WHERE id = _day_id;

  _result := public.close_sales_stock_day_legacy(
    _sales_user_id,
    _stock_date,
    _occurred_at
  );

  UPDATE public.sales_stock_days
  SET status = 'open', closed_at = NULL
  WHERE id = _day_id;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_sales_stock_day(uuid, date, timestamptz)
TO authenticated;

NOTIFY pgrst, 'reload schema';
