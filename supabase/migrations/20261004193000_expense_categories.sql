CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, name)
);

CREATE INDEX expense_categories_owner_id_idx ON public.expense_categories(owner_id);
GRANT SELECT, INSERT, UPDATE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage expense categories"
ON public.expense_categories
FOR ALL TO authenticated
USING (owner_id = public.business_owner_id() AND public.is_business_owner())
WITH CHECK (owner_id = public.business_owner_id() AND public.is_business_owner());

CREATE POLICY "team reads expense categories"
ON public.expense_categories
FOR SELECT TO authenticated
USING (owner_id = public.business_owner_id());

INSERT INTO public.expense_categories (owner_id, name)
SELECT p.id, c.name
FROM public.profiles p
CROSS JOIN (VALUES ('Bensin'), ('Makan'), ('Parkir'), ('Tol'), ('Tambal Ban'), ('Ganti Oli')) AS c(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories ec WHERE ec.owner_id = p.id
);
