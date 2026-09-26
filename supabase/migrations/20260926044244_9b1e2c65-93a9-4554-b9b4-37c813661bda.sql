CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  business_name text,
  user_email text,
  license_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (business_name) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, user_email) VALUES (NEW.id, NEW.email) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  map_location text,
  owner_phone text,
  store_photo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlets TO authenticated;
GRANT ALL ON public.outlets TO service_role;
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own outlets" ON public.outlets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  receipt_number text NOT NULL,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  sales_name text NOT NULL,
  visit_date timestamptz NOT NULL DEFAULT now(),
  transaction_type text NOT NULL DEFAULT 'Consignment' CHECK (transaction_type IN ('Consignment','Direct Sale')),
  line_items jsonb NOT NULL DEFAULT '[]',
  total_sales numeric NOT NULL DEFAULT 0,
  previous_debt numeric NOT NULL DEFAULT 0,
  total_due numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  remaining_debt numeric NOT NULL DEFAULT 0,
  new_consignment_items jsonb NOT NULL DEFAULT '[]',
  custom_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_outlet_idx ON public.transactions(outlet_id, visit_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "upload own store photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'store-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "read own store photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'store-photos' AND (storage.foldername(name))[1] = auth.uid()::text);