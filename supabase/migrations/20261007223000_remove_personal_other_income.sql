-- Remove the deprecated personal "Other Income" feature.
-- Historical migrations that introduced the table are intentionally retained.
DROP TABLE IF EXISTS public.personal_other_income CASCADE;
NOTIFY pgrst, 'reload schema';
