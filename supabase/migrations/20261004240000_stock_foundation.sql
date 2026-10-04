-- Sales Pouch stock foundation
-- Master Produk remains the product master.
-- Master Stok is a global monitoring view.
-- Opening stock is the one-time starting balance; migration mode may be entered progressively.
-- All later changes are stock movements.

CREATE TABLE IF NOT EXISTS public.stock_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('migration', 'from_start')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finalized')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id)
);

CREATE TABLE IF NOT EXISTS public.stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  location_type text NOT NULL CHECK (location_type IN ('warehouse', 'outlet', 'sales')),
  name text NOT NULL,
  outlet_id uuid REFERENCES public.outlets(id) ON DELETE CASCADE,
  team_member_user_id uuid REFERENCES public.team_members(user_id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (location_type = 'warehouse' AND outlet_id IS NULL AND team_member_user_id IS NULL)
    OR
    (location_type = 'outlet' AND outlet_id IS NOT NULL AND team_member_user_id IS NULL)
    OR
    (location_type = 'sales' AND outlet_id IS NULL AND team_member_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_locations_warehouse_name_uq
  ON public.stock_locations(owner_id, lower(name))
  WHERE location_type = 'warehouse';

CREATE UNIQUE INDEX IF NOT EXISTS stock_locations_outlet_uq
  ON public.stock_locations(owner_id, outlet_id)
  WHERE location_type = 'outlet';

CREATE UNIQUE INDEX IF NOT EXISTS stock_locations_sales_uq
  ON public.stock_locations(owner_id, team_member_user_id)
  WHERE location_type = 'sales';

CREATE INDEX IF NOT EXISTS stock_locations_owner_idx
  ON public.stock_locations(owner_id);

CREATE TABLE IF NOT EXISTS public.stock_opening_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id uuid NOT NULL REFERENCES public.stock_setups(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  counted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (setup_id, location_id, product_id)
);

CREATE INDEX IF NOT EXISTS stock_opening_items_owner_idx
  ON public.stock_opening_items(owner_id);
CREATE INDEX IF NOT EXISTS stock_opening_items_location_idx
  ON public.stock_opening_items(location_id);
CREATE INDEX IF NOT EXISTS stock_opening_items_product_idx
  ON public.stock_opening_items(product_id);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (
    movement_type IN (
      'production',
      'purchase',
      'transfer',
      'sale',
      'return_in',
      'return_out',
      'damage',
      'loss',
      'adjustment_in',
      'adjustment_out'
    )
  ),
  from_location_id uuid REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  to_location_id uuid REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  reference_type text,
  reference_id uuid,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_location_id IS NOT NULL OR to_location_id IS NOT NULL),
  CHECK (from_location_id IS NULL OR to_location_id IS NULL OR from_location_id <> to_location_id)
);

CREATE INDEX IF NOT EXISTS stock_movements_owner_idx
  ON public.stock_movements(owner_id);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx
  ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS stock_movements_from_location_idx
  ON public.stock_movements(from_location_id);
CREATE INDEX IF NOT EXISTS stock_movements_to_location_idx
  ON public.stock_movements(to_location_id);
CREATE INDEX IF NOT EXISTS stock_movements_occurred_at_idx
  ON public.stock_movements(occurred_at);

-- Opening edits are allowed only while setup is active.
CREATE OR REPLACE FUNCTION public.validate_stock_opening_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setup_status text;
  location_owner uuid;
  product_owner uuid;
BEGIN
  SELECT status INTO setup_status
  FROM public.stock_setups
  WHERE id = NEW.setup_id AND owner_id = NEW.owner_id;

  IF setup_status IS NULL THEN
    RAISE EXCEPTION 'Setup stok tidak ditemukan.';
  END IF;

  IF setup_status <> 'active' THEN
    RAISE EXCEPTION 'Stok Pembukaan sudah dikunci.';
  END IF;

  SELECT owner_id INTO location_owner
  FROM public.stock_locations
  WHERE id = NEW.location_id;

  IF location_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Lokasi stok bukan milik bisnis ini.';
  END IF;

  SELECT user_id INTO product_owner
  FROM public.products
  WHERE id = NEW.product_id;

  IF product_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Produk bukan milik bisnis ini.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_stock_opening_before_write
ON public.stock_opening_items;

CREATE TRIGGER validate_stock_opening_before_write
BEFORE INSERT OR UPDATE ON public.stock_opening_items
FOR EACH ROW EXECUTE FUNCTION public.validate_stock_opening_write();

CREATE OR REPLACE FUNCTION public.validate_stock_setup_finalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'finalized' AND NEW.status <> 'finalized' THEN
    RAISE EXCEPTION 'Setup stok yang sudah final tidak dapat dibuka kembali.';
  END IF;

  IF NEW.status = 'finalized' AND OLD.status <> 'finalized' THEN
    NEW.finalized_at := COALESCE(NEW.finalized_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_stock_setup_finalize_before_write
ON public.stock_setups;

CREATE TRIGGER validate_stock_setup_finalize_before_write
BEFORE UPDATE OF status ON public.stock_setups
FOR EACH ROW EXECUTE FUNCTION public.validate_stock_setup_finalize();

-- Global Master Stok: monitoring only.
-- Opening contributes positive stock; movement transfers stock between locations or in/out of the business.
CREATE OR REPLACE VIEW public.master_stock_global AS
WITH opening AS (
  SELECT
    soi.owner_id,
    soi.product_id,
    soi.location_id,
    SUM(soi.quantity) AS qty
  FROM public.stock_opening_items soi
  GROUP BY soi.owner_id, soi.product_id, soi.location_id
), movement_in AS (
  SELECT
    sm.owner_id,
    sm.product_id,
    sm.to_location_id AS location_id,
    SUM(sm.quantity) AS qty
  FROM public.stock_movements sm
  WHERE sm.to_location_id IS NOT NULL
  GROUP BY sm.owner_id, sm.product_id, sm.to_location_id
), movement_out AS (
  SELECT
    sm.owner_id,
    sm.product_id,
    sm.from_location_id AS location_id,
    SUM(sm.quantity) AS qty
  FROM public.stock_movements sm
  WHERE sm.from_location_id IS NOT NULL
  GROUP BY sm.owner_id, sm.product_id, sm.from_location_id
), balances AS (
  SELECT owner_id, product_id, location_id, qty FROM opening
  UNION ALL
  SELECT owner_id, product_id, location_id, qty FROM movement_in
  UNION ALL
  SELECT owner_id, product_id, location_id, -qty FROM movement_out
)
SELECT
  b.owner_id,
  b.product_id,
  p.name AS product_name,
  SUM(b.qty) AS global_quantity
FROM balances b
JOIN public.products p ON p.id = b.product_id
GROUP BY b.owner_id, b.product_id, p.name;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_setups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_opening_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT SELECT ON public.master_stock_global TO authenticated;

GRANT ALL ON public.stock_setups TO service_role;
GRANT ALL ON public.stock_locations TO service_role;
GRANT ALL ON public.stock_opening_items TO service_role;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_opening_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business manages stock setups"
ON public.stock_setups FOR ALL TO authenticated
USING (owner_id = public.business_owner_id())
WITH CHECK (owner_id = public.business_owner_id());

CREATE POLICY "business manages stock locations"
ON public.stock_locations FOR ALL TO authenticated
USING (owner_id = public.business_owner_id())
WITH CHECK (owner_id = public.business_owner_id());

CREATE POLICY "business manages stock opening"
ON public.stock_opening_items FOR ALL TO authenticated
USING (owner_id = public.business_owner_id())
WITH CHECK (owner_id = public.business_owner_id());

CREATE POLICY "business manages stock movements"
ON public.stock_movements FOR ALL TO authenticated
USING (owner_id = public.business_owner_id())
WITH CHECK (owner_id = public.business_owner_id());

NOTIFY pgrst, 'reload schema';
