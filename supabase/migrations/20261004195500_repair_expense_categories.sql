-- Repair migration: make sure expense_categories exists in databases where the
-- earlier migration was not applied, including Lovable/Supabase sync environments.

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.expense_categories
SET created_by = owner_id
WHERE created_by IS NULL;

ALTER TABLE public.expense_categories
  ALTER COLUMN created_by SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_owner_name_unique
  ON public.expense_categories(owner_id, name);

CREATE INDEX IF NOT EXISTS expense_categories_owner_id_idx
  ON public.expense_categories(owner_id);

GRANT SELECT, INSERT, UPDATE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners manage expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "team reads expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "users manage own expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "business users read expense categories" ON public.expense_categories;

CREATE POLICY "users manage own expense categories"
ON public.expense_categories
FOR ALL TO authenticated
USING (
  created_by = auth.uid()
  AND owner_id = public.business_owner_id()
)
WITH CHECK (
  created_by = auth.uid()
  AND owner_id = public.business_owner_id()
);

CREATE POLICY "business users read expense categories"
ON public.expense_categories
FOR SELECT TO authenticated
USING (owner_id = public.business_owner_id());

-- Give each account a useful starting set only when it has no categories yet.
INSERT INTO public.expense_categories (owner_id, created_by, name)
SELECT p.id, p.id, c.name
FROM public.profiles p
CROSS JOIN (VALUES
  ('Bensin'),
  ('Makan'),
  ('Parkir'),
  ('Tol'),
  ('Tambal Ban'),
  ('Ganti Oli')
) AS c(name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.expense_categories ec
  WHERE ec.owner_id = p.id
);

-- Ask PostgREST to reload its schema cache after the table/columns are ready.
NOTIFY pgrst, 'reload schema';
