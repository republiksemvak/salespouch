ALTER TABLE public.team_members ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.apply_visit_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item jsonb; item_name text; delta numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.outlets WHERE id = NEW.outlet_id AND user_id = NEW.user_id) THEN RAISE EXCEPTION 'Outlet does not belong to business'; END IF;
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