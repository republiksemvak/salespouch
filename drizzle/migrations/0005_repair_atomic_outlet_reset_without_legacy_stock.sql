CREATE OR REPLACE FUNCTION public.owner_reset_outlet_data(_outlet_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp AS $function$
DECLARE
  _owner_id uuid;
  _outlet_name text;
  _locations uuid[];
  _tx_ids uuid[];
  _pid uuid;
  _deleted_tx_count integer := 0;
  _deleted_sm_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan.'; END IF;
  _owner_id := public.business_owner_id();
  IF _owner_id IS NULL OR NOT public.is_business_owner() THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Owner bisnis yang dapat mereset data toko.';
  END IF;
  SELECT name INTO _outlet_name FROM public.outlets
  WHERE id = _outlet_id AND user_id = _owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Toko tidak ditemukan atau bukan milik bisnis Anda.'; END IF;
  -- Product locks serialize against visits and physical stock writes.
  PERFORM id FROM public.products WHERE user_id = _owner_id ORDER BY id FOR UPDATE;
  PERFORM id FROM public.stock_locations WHERE owner_id = _owner_id ORDER BY id FOR UPDATE;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO _locations
  FROM public.stock_locations WHERE owner_id = _owner_id AND outlet_id = _outlet_id AND location_type = 'outlet';
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO _tx_ids
  FROM public.transactions WHERE user_id = _owner_id AND outlet_id = _outlet_id;
  -- Include direct sales from Warehouse/Sales as well as transfers to this outlet.
  DELETE FROM public.stock_movements WHERE owner_id = _owner_id AND
    ((reference_type = 'transaction' AND reference_id = ANY(_tx_ids)) OR
     from_location_id = ANY(_locations) OR to_location_id = ANY(_locations));
  GET DIAGNOSTICS _deleted_sm_count = ROW_COUNT;
  DELETE FROM public.transactions WHERE user_id = _owner_id AND outlet_id = _outlet_id;
  GET DIAGNOSTICS _deleted_tx_count = ROW_COUNT;
  DELETE FROM public.stock_opening_items WHERE owner_id = _owner_id AND location_id = ANY(_locations);
  DELETE FROM public.store_schedules WHERE owner_id = _owner_id AND outlet_id = _outlet_id;
  -- Warehouse receipts remain valid; only detach the buyer's optional store link.
  UPDATE public.warehouse_direct_sales SET buyer_outlet_id = NULL
  WHERE owner_id = _owner_id AND buyer_outlet_id = _outlet_id;
  FOR _pid IN SELECT id FROM public.products WHERE user_id = _owner_id LOOP
    PERFORM public.rebuild_product_warehouse_stock(_owner_id, _pid);
    -- Also clear stale cached stock when the last stock movement was removed.
    UPDATE public.products SET warehouse_stock = coalesce((
      SELECT sum(soi.quantity) FROM public.stock_opening_items soi
      JOIN public.stock_locations sl ON sl.id = soi.location_id
      WHERE soi.owner_id = _owner_id AND soi.product_id = _pid AND sl.location_type = 'warehouse'
    ), 0) + coalesce((
      SELECT sum(CASE WHEN sl.id = sm.to_location_id THEN sm.quantity ELSE 0 END -
                 CASE WHEN sl.id = sm.from_location_id THEN sm.quantity ELSE 0 END)
      FROM public.stock_movements sm JOIN public.stock_locations sl
      ON sl.id = sm.from_location_id OR sl.id = sm.to_location_id
      WHERE sm.owner_id = _owner_id AND sm.product_id = _pid AND sl.location_type = 'warehouse'
    ), 0) WHERE id = _pid AND user_id = _owner_id;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'outlet_id', _outlet_id, 'outlet_name', _outlet_name,
    'transactions_deleted', _deleted_tx_count, 'movements_cleaned', _deleted_sm_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.owner_reset_outlet_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_reset_outlet_data(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.owner_delete_outlet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_delete_outlet(uuid) TO authenticated, service_role;