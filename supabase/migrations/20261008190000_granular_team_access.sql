-- Owner-managed granular permissions for Admin/Manager.
-- Sales permission behavior is intentionally unchanged.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS permissions_configured boolean NOT NULL DEFAULT false;

-- Normalize the existing coarse permission keys to the new view-level keys.
UPDATE public.team_permissions
SET permission_key = CASE permission_key
  WHEN 'team' THEN 'team.view'
  WHEN 'outlets' THEN 'outlets.view'
  WHEN 'schedule' THEN 'schedule.view'
  WHEN 'sales_stock' THEN 'sales_stock.view'
  WHEN 'transactions' THEN 'transactions.view'
  WHEN 'operations' THEN 'operations.view'
  WHEN 'travel_funds' THEN 'travel_funds.view'
  WHEN 'expenses' THEN 'expenses.view'
  WHEN 'reports' THEN 'reports.view'
  WHEN 'kpi' THEN 'kpi.view'
  WHEN 'direct_selling' THEN 'direct_selling.view'
  WHEN 'products' THEN 'products.view'
  WHEN 'master_stock' THEN 'master_stock.view'
  WHEN 'notes' THEN 'notes.view'
  WHEN 'profile' THEN 'profile.view'
  WHEN 'payroll' THEN 'payroll.view'
  ELSE permission_key
END
WHERE permission_key IN (
  'team','outlets','schedule','sales_stock','transactions','operations',
  'travel_funds','expenses','reports','kpi','direct_selling','products',
  'master_stock','notes','profile','payroll'
);

-- Existing Admin/Manager permission rows are now explicitly configured.
UPDATE public.team_members tm
SET permissions_configured = true
WHERE tm.position IN ('admin','manager')
  AND EXISTS (
    SELECT 1 FROM public.team_permissions tp
    WHERE tp.owner_id = tm.owner_id AND tp.user_id = tm.user_id
  );

-- Members who never had a custom permission set receive the role baseline once.
INSERT INTO public.team_permissions(owner_id, user_id, permission_key)
SELECT tm.owner_id, tm.user_id, key
FROM public.team_members tm
CROSS JOIN LATERAL unnest(ARRAY[
  'team.view','outlets.view','schedule.view','sales_stock.view',
  'transactions.view','operations.view','travel_funds.view','expenses.view',
  'reports.view','kpi.view','direct_selling.view','products.view',
  'master_stock.view','notes.view'
]::text[]) AS key
WHERE tm.position IN ('admin','manager')
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_permissions tp
    WHERE tp.owner_id = tm.owner_id AND tp.user_id = tm.user_id
  )
ON CONFLICT (owner_id, user_id, permission_key) DO NOTHING;

UPDATE public.team_members tm
SET permissions_configured = true
WHERE tm.position IN ('admin','manager')
  AND EXISTS (
    SELECT 1 FROM public.team_permissions tp
    WHERE tp.owner_id = tm.owner_id AND tp.user_id = tm.user_id
  );

NOTIFY pgrst, 'reload schema';
