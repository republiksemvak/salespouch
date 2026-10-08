-- Server-side guard: only the business Owner may load stock to Sales or return Sales stock.
-- Preserve the existing Stage 4 reopen/multiple-load behavior while enforcing the role at RPC level.

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
  IF NOT public.is_business_owner() THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat memuat stok ke Sales.';
  END IF;
  _owner_id := public.business_owner_id();
  IF _owner_id IS NULL THEN RAISE EXCEPTION 'Bisnis tidak ditemukan.'; END IF;

  SELECT id INTO _day_id
  FROM public.sales_stock_days
  WHERE owner_id = _owner_id
    AND sales_user_id = _sales_user_id
    AND stock_date = _stock_date
  FOR UPDATE;

  IF _day_id IS NOT NULL THEN
    UPDATE public.sales_stock_days SET status = 'open', closed_at = NULL WHERE id = _day_id;
  END IF;

  RETURN public.record_sales_morning_load_legacy(_sales_user_id, _items, _stock_date, _occurred_at);
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
  _day_id uuid;
  _result uuid;
BEGIN
  IF NOT public.is_business_owner() THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat mengembalikan stok Sales ke Gudang.';
  END IF;
  _owner_id := public.business_owner_id();
  IF _owner_id IS NULL THEN RAISE EXCEPTION 'Bisnis tidak ditemukan.'; END IF;

  SELECT id INTO _day_id
  FROM public.sales_stock_days
  WHERE owner_id = _owner_id
    AND sales_user_id = _sales_user_id
    AND stock_date = _stock_date
  FOR UPDATE;

  IF _day_id IS NULL THEN RAISE EXCEPTION 'Belum ada Loading Sales untuk tanggal ini.'; END IF;

  UPDATE public.sales_stock_days SET status = 'open', closed_at = NULL WHERE id = _day_id;
  _result := public.close_sales_stock_day_legacy(_sales_user_id, _stock_date, _occurred_at);
  UPDATE public.sales_stock_days SET status = 'open', closed_at = NULL WHERE id = _day_id;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sales_morning_load(uuid, jsonb, date, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_sales_stock_day(uuid, date, timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
