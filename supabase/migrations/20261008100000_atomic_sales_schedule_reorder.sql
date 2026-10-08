-- Atomic swap for Sales-owned visit order. Avoids unique-order collisions and cross-business updates.
CREATE OR REPLACE FUNCTION public.swap_sales_schedule_order(
  _first_id uuid,
  _second_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a public.store_schedules%ROWTYPE;
  b public.store_schedules%ROWTYPE;
  temp_order integer;
BEGIN
  SELECT * INTO a FROM public.store_schedules
  WHERE id = _first_id
    AND owner_id = public.business_owner_id()
    AND sales_id = auth.uid()
  FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Jadwal pertama tidak ditemukan atau bukan milik Sales.'; END IF;

  SELECT * INTO b FROM public.store_schedules
  WHERE id = _second_id
    AND owner_id = a.owner_id
    AND sales_id = auth.uid()
    AND day_of_week = a.day_of_week
  FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Jadwal kedua tidak ditemukan atau bukan milik Sales.'; END IF;

  temp_order := -1 * GREATEST(ABS(COALESCE(a.visit_order, 0)), ABS(COALESCE(b.visit_order, 0)), 1) - 1;
  UPDATE public.store_schedules SET visit_order = temp_order WHERE id = a.id;
  UPDATE public.store_schedules SET visit_order = COALESCE(a.visit_order, 0) WHERE id = b.id;
  UPDATE public.store_schedules SET visit_order = COALESCE(b.visit_order, 0) WHERE id = a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.swap_sales_schedule_order(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swap_sales_schedule_order(uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
