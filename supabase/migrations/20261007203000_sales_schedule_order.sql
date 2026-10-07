-- Urutan kunjungan/tagihan yang dapat diatur oleh Sales per hari.
ALTER TABLE public.store_schedules
  ADD COLUMN IF NOT EXISTS visit_order integer;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY owner_id, sales_id, day_of_week
      ORDER BY created_at, id
    )::integer AS rn
  FROM public.store_schedules
)
UPDATE public.store_schedules s
SET visit_order = r.rn
FROM ranked r
WHERE s.id = r.id
  AND s.visit_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_store_schedules_sales_day_order
  ON public.store_schedules(sales_id, day_of_week, visit_order);

DROP POLICY IF EXISTS "sales update own store schedule order" ON public.store_schedules;
CREATE POLICY "sales update own store schedule order"
  ON public.store_schedules
  FOR UPDATE
  TO authenticated
  USING (owner_id = business_owner_id() AND sales_id = auth.uid())
  WITH CHECK (owner_id = business_owner_id() AND sales_id = auth.uid());

NOTIFY pgrst, 'reload schema';
