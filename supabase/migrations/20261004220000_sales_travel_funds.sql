CREATE TABLE IF NOT EXISTS public.sales_travel_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sales_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  note text,
  given_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_travel_funds_owner_id_idx ON public.sales_travel_funds(owner_id);
CREATE INDEX IF NOT EXISTS sales_travel_funds_sales_id_idx ON public.sales_travel_funds(sales_id);
CREATE INDEX IF NOT EXISTS sales_travel_funds_given_at_idx ON public.sales_travel_funds(given_at DESC);

GRANT SELECT, INSERT ON public.sales_travel_funds TO authenticated;
GRANT ALL ON public.sales_travel_funds TO service_role;

ALTER TABLE public.sales_travel_funds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team reads travel funds" ON public.sales_travel_funds;
DROP POLICY IF EXISTS "owners add travel funds" ON public.sales_travel_funds;

CREATE POLICY "team reads travel funds"
ON public.sales_travel_funds
FOR SELECT TO authenticated
USING (
  owner_id = public.business_owner_id()
  AND (
    public.is_business_owner()
    OR sales_id = auth.uid()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'candraprinting@gmail.com',
      'ganlapor@gmail.com',
      'republiksemvak@gmail.com'
    )
  )
);

CREATE POLICY "owners add travel funds"
ON public.sales_travel_funds
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = public.business_owner_id()
  AND (
    public.is_business_owner()
    OR lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'candraprinting@gmail.com',
      'ganlapor@gmail.com',
      'republiksemvak@gmail.com'
    )
  )
);

NOTIFY pgrst, 'reload schema';
