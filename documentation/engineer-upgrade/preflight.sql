-- READ ONLY. Run against the intended staging environment, then review results.
select current_database(),current_user;
select name,to_regprocedure(name) is not null as present from (values
 ('public.mcpa_wa_equipment_catalog()'),('public.mcpa_wa_submit_equipment(uuid,text,uuid,integer,text)'),
 ('public.mcpa_b_snapshot()'),('public.mcpa_movement_snapshot()'),('public.mcpa_invitation_step(uuid,text,jsonb)'),
 ('mcpa_auth_private.wa_read_actor(text[])')) f(name);
select name,to_regclass(name) is not null as present from (values
 ('public.mcpa_account_invitations'),('public.mcpa_wa_equipment_requests'),('public.mcpa_b_retirements'),('public.mcpa_movement_reservations')) t(name);
-- Record aggregate counts before applying; no personal data or credentials.
select 'equipment' as entity,count(*) from public.equipment union all
select 'profiles',count(*) from public.profiles union all
select 'movements',count(*) from public.mcpa_movements union all
select 'quantity requests',count(*) from public.mcpa_wa_equipment_requests union all
select 'retirements',count(*) from public.mcpa_b_retirements;
