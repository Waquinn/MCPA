-- OPTIONAL: Only for the current public-access prototype, which has no real login.
-- Run after setup.sql if public site CRUD is the intended access model.
-- Anyone with this project's public API access can then create/edit/delete sites.
-- This changes permissions only for sites, not equipment or any other table.
begin;
grant insert, update, delete on public.sites to anon;
alter policy sites_insert on public.sites to anon, authenticated;
alter policy sites_update on public.sites to anon, authenticated;
alter policy sites_delete on public.sites to anon, authenticated;
commit;
