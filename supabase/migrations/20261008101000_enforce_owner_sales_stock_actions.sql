-- Server-side guard: only the business Owner may load stock to Sales or return Sales stock.
-- The UI hides these actions from Sales, but the RPC must enforce the rule as well.

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
BEGIN
  IF NOT public.is_business_owner() THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat memuat stok ke Sales.';
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
BEGIN
  IF NOT public.is_business_owner() THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat mengembalikan stok Sales ke Gudang.';
  END IF;
  RETURN public.close_sales_stock_day_legacy(_sales_user_id, _stock_date, _occurred_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sales_morning_load(uuid, jsonb, date, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_sales_stock_day(uuid, date, timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
