-- Fix Sales stock visibility by exposing only the authenticated Sales account's current balance.
CREATE OR REPLACE FUNCTION public.get_sales_current_stock(
  _sales_user_id uuid
)
RETURNS TABLE (
  product_id uuid,
  quantity numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _owner_id uuid;
  _sales_location_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  _owner_id := public.business_owner_id();
  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan.';
  END IF;

  IF NOT public.is_business_owner()
     AND _sales_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Akun Sales hanya dapat melihat stok miliknya sendiri.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = _sales_user_id
      AND tm.owner_id = _owner_id
  ) THEN
    RAISE EXCEPTION 'Sales bukan anggota bisnis ini.';
  END IF;

  SELECT sl.id
  INTO _sales_location_id
  FROM public.stock_locations sl
  WHERE sl.owner_id = _owner_id
    AND sl.location_type = 'sales'
    AND sl.team_member_user_id = _sales_user_id
    AND sl.is_active = true
  LIMIT 1;

  IF _sales_location_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH balances AS (
    SELECT
      soi.product_id,
      SUM(soi.quantity) AS quantity
    FROM public.stock_opening_items soi
    WHERE soi.owner_id = _owner_id
      AND soi.location_id = _sales_location_id
    GROUP BY soi.product_id

    UNION ALL

    SELECT
      sm.product_id,
      SUM(sm.quantity) AS quantity
    FROM public.stock_movements sm
    WHERE sm.owner_id = _owner_id
      AND sm.to_location_id = _sales_location_id
    GROUP BY sm.product_id

    UNION ALL

    SELECT
      sm.product_id,
      -SUM(sm.quantity) AS quantity
    FROM public.stock_movements sm
    WHERE sm.owner_id = _owner_id
      AND sm.from_location_id = _sales_location_id
    GROUP BY sm.product_id
  )
  SELECT b.product_id, SUM(b.quantity) AS quantity
  FROM balances b
  GROUP BY b.product_id
  HAVING SUM(b.quantity) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_current_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_current_stock(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
