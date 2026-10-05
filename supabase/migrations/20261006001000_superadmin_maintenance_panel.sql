create table if not exists public.system_maintenance (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  title text not null default 'Sedang Dalam Pemeliharaan',
  message text not null default 'Kami sedang melakukan perbaikan dan pengembangan sistem. Silakan kembali beberapa saat lagi.',
  eta text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.system_maintenance (id)
values (1)
on conflict (id) do nothing;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'candraprinting@gmail.com',
    'ganlapor@gmail.com',
    'republiksemvak@gmail.com'
  );
$$;

revoke all on public.system_maintenance from anon;
grant select, insert, update on public.system_maintenance to authenticated;

grant execute on function public.is_super_admin() to authenticated;

alter table public.system_maintenance enable row level security;

drop policy if exists "system_maintenance_superadmin_select" on public.system_maintenance;
drop policy if exists "system_maintenance_superadmin_insert" on public.system_maintenance;
drop policy if exists "system_maintenance_superadmin_update" on public.system_maintenance;

create policy "system_maintenance_superadmin_select"
on public.system_maintenance
for select
to authenticated
using (public.is_super_admin());

create policy "system_maintenance_superadmin_insert"
on public.system_maintenance
for insert
to authenticated
with check (public.is_super_admin());

create policy "system_maintenance_superadmin_update"
on public.system_maintenance
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create or replace function public.touch_system_maintenance()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_system_maintenance_touch on public.system_maintenance;
create trigger trg_system_maintenance_touch
before update on public.system_maintenance
for each row execute function public.touch_system_maintenance();
