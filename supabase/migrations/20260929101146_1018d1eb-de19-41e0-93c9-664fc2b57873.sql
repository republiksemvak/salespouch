REVOKE INSERT, UPDATE, DELETE ON public.products FROM authenticated;
GRANT INSERT (name,price,price_grosir,price_agen,cost_price,warehouse_stock,pcs_per_pack) ON public.products TO authenticated;
GRANT UPDATE (name,price,price_grosir,price_agen,cost_price,warehouse_stock,pcs_per_pack) ON public.products TO authenticated;
GRANT DELETE ON public.products TO authenticated;
CREATE OR REPLACE FUNCTION public.product_owner_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ BEGIN IF NOT public.is_business_owner() THEN RAISE EXCEPTION 'Owner only'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER product_owner_insert_guard BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.product_owner_insert_guard();