-- Run in the Supabase SQL Editor. Safe to rerun on the original Sites setup.
-- Adds Sites and a stable equipment reference; existing equipment stays unassigned.
-- The current app has no Supabase login, so Sites CRUD uses the anon role.
-- These policies allow public Sites CRUD; they do not change equipment access.
begin;

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  location text not null check (char_length(btrim(location)) between 1 and 240),
  assigned_engineer text not null check (char_length(btrim(assigned_engineer)) between 1 and 120),
  phase text not null default 'Planning Phase' check (char_length(btrim(phase)) between 1 and 80),
  status text not null default 'planning'
    check (status in ('active', 'discrepancy', 'verified', 'turnover', 'idle', 'planning', 'completed')),
  progress integer not null default 0 check (progress between 0 and 100),
  last_inventory_check date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sites_name_unique
  on public.sites (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create or replace function public.sites_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

drop trigger if exists sites_updated_at on public.sites;
create trigger sites_updated_at
before update on public.sites
for each row execute function public.sites_touch_updated_at();

alter table public.equipment
  add column if not exists site_id uuid references public.sites(id) on delete restrict;
create index if not exists equipment_site_id_idx on public.equipment(site_id);

-- Use the same business date as the UI, including after midnight in Manila.
alter table public.sites drop constraint if exists sites_last_inventory_check_check;
alter table public.sites add constraint sites_last_inventory_check_check
  check (last_inventory_check <= (current_timestamp at time zone 'Asia/Manila')::date);

-- Only the future assignment/movement workflow should change equipment.site_id.
-- RESTRICT prevents deleting a site with equipment, including zero-quantity rows.
comment on column public.equipment.site_id is
  'Current site assignment. Read-only in the Sites module; maintained by the assignment/movement workflow.';

alter table public.sites enable row level security;

grant select, insert, update, delete on public.sites to anon, authenticated;

drop policy if exists sites_read on public.sites;
create policy sites_read on public.sites
for select to anon, authenticated using (true);
drop policy if exists sites_insert on public.sites;
create policy sites_insert on public.sites
for insert to anon, authenticated with check (true);
drop policy if exists sites_update on public.sites;
create policy sites_update on public.sites
for update to anon, authenticated using (true) with check (true);
drop policy if exists sites_delete on public.sites;
create policy sites_delete on public.sites
for delete to anon, authenticated using (true);

-- No mock projects, quantities, holders or transfers are inserted.
-- Create real sites through the Sites form after running this script.
notify pgrst, 'reload schema';
commit;
