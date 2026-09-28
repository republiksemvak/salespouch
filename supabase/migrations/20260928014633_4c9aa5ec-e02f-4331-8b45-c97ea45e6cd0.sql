create type public.app_role as enum ('admin','user');
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade not null, role app_role not null, unique(user_id, role));
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create policy "own roles read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

insert into public.user_roles(user_id, role) select id,'admin' from auth.users where lower(email) in ('candraprinting@gmail.com','ganlapor@gmail.com') on conflict do nothing;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.profiles (id, user_email) VALUES (NEW.id, NEW.email) ON CONFLICT DO NOTHING;
  IF lower(NEW.email) IN ('candraprinting@gmail.com','ganlapor@gmail.com') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id,'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$;

create policy "admin read profiles" on public.profiles for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.license_packages (id uuid primary key default gen_random_uuid(), name text not null, days integer not null check (days > 0), price numeric not null default 0, active boolean not null default true, created_at timestamptz not null default now());
grant select, insert, update, delete on public.license_packages to authenticated;
grant all on public.license_packages to service_role;
alter table public.license_packages enable row level security;
create policy "read active packages" on public.license_packages for select to authenticated using (active or public.has_role(auth.uid(),'admin'));
create policy "admin manage packages" on public.license_packages for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.promos (id uuid primary key default gen_random_uuid(), code text not null unique, description text, discount_percent integer not null default 0 check (discount_percent between 0 and 100), bonus_days integer not null default 0 check (bonus_days >= 0), valid_until timestamptz, active boolean not null default true, created_at timestamptz not null default now());
grant select, insert, update, delete on public.promos to authenticated;
grant all on public.promos to service_role;
alter table public.promos enable row level security;
create policy "read active promos" on public.promos for select to authenticated using ((active and (valid_until is null or valid_until > now())) or public.has_role(auth.uid(),'admin'));
create policy "admin manage promos" on public.promos for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

insert into public.license_packages(name, days, price) values ('1 Bulan',30,50000),('3 Bulan',90,135000),('1 Tahun',365,450000);