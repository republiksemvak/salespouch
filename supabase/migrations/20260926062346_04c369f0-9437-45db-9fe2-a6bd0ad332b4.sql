ALTER TABLE public.profiles ADD COLUMN business_address text, ADD COLUMN business_phone text;
GRANT UPDATE (business_name, business_address, business_phone) ON public.profiles TO authenticated;