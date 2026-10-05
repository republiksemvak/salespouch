-- Allow authenticated users to read the maintenance state so the app can
-- render the maintenance screen. Write access remains Super Admin only.

drop policy if exists "system_maintenance_superadmin_select"
on public.system_maintenance;

create policy "system_maintenance_authenticated_select"
on public.system_maintenance
for select
to authenticated
using (true);
