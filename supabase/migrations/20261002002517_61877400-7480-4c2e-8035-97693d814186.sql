ALTER TABLE public.outlets
  ADD COLUMN owner_name text,
  ADD COLUMN address text,
  ADD COLUMN route_notes text;

REVOKE UPDATE ON public.outlets FROM authenticated;
GRANT UPDATE (name, map_location, owner_phone, store_photo, owner_name, address, route_notes) ON public.outlets TO authenticated;
GRANT ALL ON public.outlets TO service_role;