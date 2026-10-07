-- Seed standard expense categories once per business owner.
-- Existing custom categories are preserved.

INSERT INTO public.expense_categories (owner_id, created_by, name)
SELECT p.id, p.id, c.name
FROM public.profiles p
CROSS JOIN (VALUES
  ('Bensin'),
  ('Parkir'),
  ('Tol'),
  ('Makan/Minum'),
  ('Pulsa/Internet'),
  ('Transportasi'),
  ('Operasional'),
  ('Lainnya')
) AS c(name)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.expense_categories ec
    WHERE ec.owner_id = p.id
      AND lower(trim(ec.name)) = lower(trim(c.name))
  );

NOTIFY pgrst, 'reload schema';
