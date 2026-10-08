-- Keep the Team page Sales stock summary aligned with the stock ledger.
-- Sum balances across every active Sales location assigned to this user;
-- legacy duplicate locations must not cause the UI to select an arbitrary one.
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

  RETURN QUERY
  WITH sales_locations AS (
    SELECT sl.id
    FROM public.stock_locations sl
    WHERE sl.owner_id = _owner_id
      AND sl.location_type = 'sales'
      AND sl.team_member_user_id = _sales_user_id
      AND sl.is_active = true
  ),
  balances AS (
    SELECT soi.product_id, SUM(soi.quantity) AS quantity
    FROM public.stock_opening_items soi
    JOIN sales_locations sl ON sl.id = soi.location_id
    WHERE soi.owner_id = _owner_id
    GROUP BY soi.product_id

    UNION ALL

    SELECT sm.product_id, SUM(sm.quantity) AS quantity
    FROM public.stock_movements sm
    JOIN sales_locations sl ON sl.id = sm.to_location_id
    WHERE sm.owner_id = _owner_id
    GROUP BY sm.product_id

    UNION ALL

    SELECT sm.product_id, -SUM(sm.quantity) AS quantity
    FROM public.stock_movements sm
    JOIN sales_locations sl ON sl.id = sm.from_location_id
    WHERE sm.owner_id = _owner_id
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
