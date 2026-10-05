-- Enforce capability permissions at the database boundary.
-- Role defaults are stored in team_permissions; Owner bypasses all capabilities.
-- This migration covers the core business surfaces currently used by the app.

-- -----------------------------------------------------------------------------
-- Outlets
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "team reads outlets" ON public.outlets;
DROP POLICY IF EXISTS "team adds outlets" ON public.outlets;
DROP POLICY IF EXISTS "owner edits outlets" ON public.outlets;
DROP POLICY IF EXISTS "owner deletes outlets" ON public.outlets;

CREATE POLICY "team reads outlets"
ON public.outlets
FOR SELECT TO authenticated
USING (
  user_id = public.business_owner_id()
  AND public.has_team_permission('outlets')
);

CREATE POLICY "team adds outlets"
ON public.outlets
FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.business_owner_id()
  AND public.has_team_permission('outlets')
);

CREATE POLICY "team edits outlets"
ON public.outlets
FOR UPDATE TO authenticated
USING (
  user_id = public.business_owner_id()
  AND public.has_team_permission('outlets')
)
WITH CHECK (
  user_id = public.business_owner_id()
  AND public.has_team_permission('outlets')
);

CREATE POLICY "team deletes outlets"
ON public.outlets
FOR DELETE TO authenticated
USING (
  user_id = public.business_owner_id()
  AND public.has_team_permission('outlets')
);

-- -----------------------------------------------------------------------------
-- Transactions
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "team reads transactions" ON public.transactions;
DROP POLICY IF EXISTS "team records visits" ON public.transactions;
DROP POLICY IF EXISTS "owner edits transactions" ON public.transactions;
DROP POLICY IF EXISTS "owner deletes transactions" ON public.transactions;

CREATE POLICY "team reads transactions"
ON public.transactions
FOR SELECT TO authenticated
USING (
  user_id = public.business_owner_id()
  AND public.has_team_permission('transactions')
);

CREATE POLICY "team records visits"
ON public.transactions
FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.business_owner_id()
  AND public.has_team_permission('transactions')
  AND EXISTS (
    SELECT 1
    FROM public.outlets
    WHERE id = outlet_id
      AND user_id = public.business_owner_id()
  )
);

CREATE POLICY "team edits transactions"
ON public.transactions
FOR UPDATE TO authenticated
USING (
  user_id = public.business_owner_id()
  AND public.has_team_permission('transactions')
)
WITH CHECK (
  user_id = public.business_owner_id()
  AND public.has_team_permission('transactions')
);

CREATE POLICY "team deletes transactions"
ON public.transactions
FOR DELETE TO authenticated
USING (
  user_id = public.business_owner_id()
  AND public.has_team_permission('transactions')
);

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "owner manages products" ON public.products;
DROP POLICY IF EXISTS "own products" ON public.products;

CREATE POLICY "team manages products"
ON public.products
FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_business_owner()
  AND public.has_team_permission('products')
)
WITH CHECK (
  user_id = auth.uid()
  AND public.is_business_owner()
  AND public.has_team_permission('products')
);

-- The sales catalog is intentionally readable by the team because transaction
-- entry needs product metadata even when the employee does not own Master Produk.
-- Mutations remain protected by the products policy above.

-- -----------------------------------------------------------------------------
-- Core stock surfaces
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "business manages stock setups" ON public.stock_setups;
DROP POLICY IF EXISTS "business manages stock locations" ON public.stock_locations;
DROP POLICY IF EXISTS "business manages stock opening" ON public.stock_opening_items;
DROP POLICY IF EXISTS "business manages stock movements" ON public.stock_movements;

CREATE POLICY "team manages stock setups"
ON public.stock_setups
FOR ALL TO authenticated
USING (
  owner_id = public.business_owner_id()
  AND (
    public.has_team_permission('master_stock')
    OR public.has_team_permission('sales_stock')
  )
)
WITH CHECK (
  owner_id = public.business_owner_id()
  AND (
    public.has_team_permission('master_stock')
    OR public.has_team_permission('sales_stock')
  )
);

CREATE POLICY "team manages stock locations"
ON public.stock_locations
FOR ALL TO authenticated
USING (
  owner_id = public.business_owner_id()
  AND (
    public.has_team_permission('master_stock')
    OR public.has_team_permission('sales_stock')
    OR public.has_team_permission('schedule')
  )
)
WITH CHECK (
  owner_id = public.business_owner_id()
  AND (
    public.has_team_permission('master_stock')
    OR public.has_team_permission('sales_stock')
    OR public.has_team_permission('schedule')
  )
);

CREATE POLICY "team manages stock opening"
ON public.stock_opening_items
FOR ALL TO authenticated
USING (
  owner_id = public.business_owner_id()
  AND public.has_team_permission('master_stock')
)
WITH CHECK (
  owner_id = public.business_owner_id()
  AND public.has_team_permission('master_stock')
);

CREATE POLICY "team manages stock movements"
ON public.stock_movements
FOR ALL TO authenticated
USING (
  owner_id = public.business_owner_id()
  AND (
    public.has_team_permission('master_stock')
    OR public.has_team_permission('sales_stock')
    OR public.has_team_permission('direct_selling')
  )
)
WITH CHECK (
  owner_id = public.business_owner_id()
  AND (
    public.has_team_permission('master_stock')
    OR public.has_team_permission('sales_stock')
    OR public.has_team_permission('direct_selling')
  )
);

-- -----------------------------------------------------------------------------
-- Sales stock day records
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "business manages sales stock days" ON public.sales_stock_days;
DROP POLICY IF EXISTS "business manages sales stock loads" ON public.sales_stock_day_loads;

CREATE POLICY "team manages sales stock days"
ON public.sales_stock_days
FOR ALL TO authenticated
USING (
  owner_id = public.business_owner_id()
  AND public.has_team_permission('sales_stock')
)
WITH CHECK (
  owner_id = public.business_owner_id()
  AND public.has_team_permission('sales_stock')
);

CREATE POLICY "team manages sales stock loads"
ON public.sales_stock_day_loads
FOR ALL TO authenticated
USING (
  owner_id = public.business_owner_id()
  AND public.has_team_permission('sales_stock')
)
WITH CHECK (
  owner_id = public.business_owner_id()
  AND public.has_team_permission('sales_stock')
);

-- Keep the global stock view subject to the base-table RLS policies.
ALTER VIEW public.master_stock_global SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
