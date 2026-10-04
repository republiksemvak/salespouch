-- Jadwal kunjungan toko: dibuat Owner, dilihat Owner + Sales/PIC.
CREATE TABLE IF NOT EXISTS public.store_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  sales_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, outlet_id, sales_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_store_schedules_owner_day
  ON public.store_schedules(owner_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_store_schedules_sales_day
  ON public.store_schedules(sales_id, day_of_week);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_schedules TO authenticated;

ALTER TABLE public.store_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners manage store schedules" ON public.store_schedules;
CREATE POLICY "owners manage store schedules"
  ON public.store_schedules
  FOR ALL
  TO authenticated
  USING (owner_id = business_owner_id() AND is_business_owner())
  WITH CHECK (owner_id = business_owner_id() AND is_business_owner());

DROP POLICY IF EXISTS "sales view assigned store schedules" ON public.store_schedules;
CREATE POLICY "sales view assigned store schedules"
  ON public.store_schedules
  FOR SELECT
  TO authenticated
  USING (owner_id = business_owner_id() AND sales_id = auth.uid());

NOTIFY pgrst, 'reload schema';
