ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_category text,
  ADD COLUMN IF NOT EXISTS business_model text,
  ADD COLUMN IF NOT EXISTS main_product text;