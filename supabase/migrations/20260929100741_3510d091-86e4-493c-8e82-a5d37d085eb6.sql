-- Peran sales dan owner ditentukan dari keanggotaan tim; enum yang sudah ada tetap dipakai untuk super admin.

CREATE TABLE public.team_members (
  user_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT different_team_user CHECK (user_id <> owner_id)
);
GRANT SELECT ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads team" ON public.team_members FOR SELECT TO authenticated USING (owner_id = auth.uid() OR user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.touch_team_member() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER touch_team_member BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.touch_team_member();

CREATE OR REPLACE FUNCTION public.business_owner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT coalesce((SELECT owner_id FROM public.team_members WHERE user_id = auth.uid()), auth.uid()) $$;
REVOKE ALL ON FUNCTION public.business_owner_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_owner_id() TO authenticated;
CREATE OR REPLACE FUNCTION public.is_business_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = auth.uid()) $$;
REVOKE ALL ON FUNCTION public.is_business_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_owner() TO authenticated;

DROP POLICY "own products" ON public.products;
CREATE POLICY "owner manages products" ON public.products FOR ALL TO authenticated USING (user_id = auth.uid() AND public.is_business_owner()) WITH CHECK (user_id = auth.uid() AND public.is_business_owner());
CREATE OR REPLACE VIEW public.sales_catalog WITH (security_invoker = false) AS SELECT id, user_id, name, price, price_grosir, price_agen, warehouse_stock, pcs_per_pack FROM public.products WHERE user_id = public.business_owner_id();
REVOKE ALL ON public.sales_catalog FROM PUBLIC, anon;
GRANT SELECT ON public.sales_catalog TO authenticated;

DROP POLICY "own outlets" ON public.outlets;
CREATE POLICY "team reads outlets" ON public.outlets FOR SELECT TO authenticated USING (user_id = public.business_owner_id());
CREATE POLICY "team adds outlets" ON public.outlets FOR INSERT TO authenticated WITH CHECK (user_id = public.business_owner_id());
CREATE POLICY "owner edits outlets" ON public.outlets FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.is_business_owner()) WITH CHECK (user_id = auth.uid() AND public.is_business_owner());
CREATE POLICY "owner deletes outlets" ON public.outlets FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.is_business_owner());

DROP POLICY "own transactions" ON public.transactions;
CREATE POLICY "team reads transactions" ON public.transactions FOR SELECT TO authenticated USING (user_id = public.business_owner_id());
CREATE POLICY "team records visits" ON public.transactions FOR INSERT TO authenticated WITH CHECK (user_id = public.business_owner_id() AND EXISTS (SELECT 1 FROM public.outlets WHERE id = outlet_id AND user_id = public.business_owner_id()));
CREATE POLICY "owner edits transactions" ON public.transactions FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.is_business_owner()) WITH CHECK (user_id = auth.uid() AND public.is_business_owner());
CREATE POLICY "owner deletes transactions" ON public.transactions FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.is_business_owner());

CREATE POLICY "owner reads team profiles" ON public.profiles FOR SELECT TO authenticated USING (id = public.business_owner_id());
CREATE POLICY "owner reads sales profiles" ON public.profiles FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.team_members WHERE owner_id = auth.uid() AND user_id = id));
DROP POLICY "own profile update" ON public.profiles;
CREATE POLICY "owner updates business profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id AND public.is_business_owner()) WITH CHECK (auth.uid() = id AND public.is_business_owner());

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, user_email) VALUES (NEW.id, NEW.email) ON CONFLICT DO NOTHING;
  IF lower(NEW.email) IN ('candraprinting@gmail.com','ganlapor@gmail.com') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id,'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP POLICY "upload own store photos" ON storage.objects;
DROP POLICY "read own store photos" ON storage.objects;
CREATE POLICY "team uploads store photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'store-photos' AND (storage.foldername(name))[1] = public.business_owner_id()::text);
CREATE POLICY "team reads store photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'store-photos' AND (storage.foldername(name))[1] = public.business_owner_id()::text);

CREATE OR REPLACE FUNCTION public.apply_visit_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item jsonb; item_name text; delta numeric;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.new_consignment_items) LOOP
    item_name := item->>'name'; delta := coalesce((item->>'qty')::numeric, 0);
    UPDATE public.products SET warehouse_stock = warehouse_stock - delta WHERE user_id = NEW.user_id AND lower(name) = lower(item_name);
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.line_items) LOOP
    item_name := item->>'name';
    delta := coalesce((item->>'returned')::numeric, 0) - CASE WHEN NEW.transaction_type = 'Direct Sale' THEN coalesce((item->>'sold')::numeric, 0) ELSE 0 END;
    UPDATE public.products SET warehouse_stock = warehouse_stock + delta WHERE user_id = NEW.user_id AND lower(name) = lower(item_name);
  END LOOP;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.apply_visit_stock() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER apply_visit_stock_after_insert AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.apply_visit_stock();