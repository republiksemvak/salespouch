CREATE TABLE public.outlet_opening_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, product_id)
);

CREATE INDEX outlet_opening_stock_outlet_idx ON public.outlet_opening_stock(outlet_id);
CREATE INDEX outlet_opening_stock_product_idx ON public.outlet_opening_stock(product_id);

ALTER TABLE public.outlet_opening_stock ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlet_opening_stock TO authenticated;
GRANT ALL ON public.outlet_opening_stock TO service_role;

CREATE POLICY "owner manages outlet opening stock"
ON public.outlet_opening_stock
FOR ALL TO authenticated
USING (user_id = auth.uid() AND public.is_business_owner())
WITH CHECK (user_id = auth.uid() AND public.is_business_owner());
