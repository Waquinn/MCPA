-- Run once in the Supabase SQL Editor for this project.
-- Adds Sites and a stable equipment reference; existing equipment stays unassigned.
begin;

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  location text not null check (char_length(btrim(location)) between 1 and 240),
  assigned_engineer text not null check (char_length(btrim(assigned_engineer)) between 1 and 120),
  phase text not null default 'Planning Phase' check (char_length(btrim(phase)) between 1 and 80),
  status text not null default 'planning'
    check (status in ('active', 'discrepancy', 'verified', 'turnover', 'idle', 'planning', 'completed')),
  progress integer not null default 0 check (progress between 0 and 100),
  last_inventory_check date check (last_inventory_check <= current_date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index sites_name_unique
  on public.sites (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create function public.sites_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create trigger sites_updated_at
before update on public.sites
for each row execute function public.sites_touch_updated_at();

alter table public.equipment
  add column site_id uuid references public.sites(id) on delete restrict;
create index equipment_site_id_idx on public.equipment(site_id);

-- Only the future assignment/movement workflow should change equipment.site_id.
-- RESTRICT prevents deleting a site with equipment, including zero-quantity rows.
comment on column public.equipment.site_id is
  'Current site assignment. Read-only in the Sites module; maintained by the assignment/movement workflow.';

alter table public.sites enable row level security;

grant select on public.sites to anon, authenticated;
grant insert, update, delete on public.sites to authenticated;
revoke insert, update, delete on public.sites from anon;

create policy sites_read on public.sites
for select to anon, authenticated using (true);
create policy sites_insert on public.sites
for insert to authenticated with check (true);
create policy sites_update on public.sites
for update to authenticated using (true) with check (true);
create policy sites_delete on public.sites
for delete to authenticated using (true);

-- No mock projects, quantities, holders or transfers are inserted.
-- Create real sites through the Sites form after configuring access.
notify pgrst, 'reload schema';
commit;
