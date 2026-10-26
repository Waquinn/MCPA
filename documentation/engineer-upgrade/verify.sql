-- READ ONLY. Compare row counts with preflight; migration must not reset records.
select name,has_function_privilege('anon',name,'execute') as anonymous,
 has_function_privilege('authenticated',name,'execute') as browser,
 has_function_privilege('service_role',name,'execute') as trusted_server
from (values ('public.mcpa_set_equipment_request_mode(text,text)'),
 ('public.mcpa_invitation_step(uuid,text,jsonb)'),('public.mcpa_complete_invitation(uuid,text,boolean)'),
 ('mcpa_auth_private.invitation_step_before_registration(uuid,text,jsonb)'),
 ('mcpa_auth_private.equipment_catalog_before_ux()')) f(name);
-- Expected browser=true only for classification (its body requires active Admin);
-- service=true only for public invitation/completion; private helpers all false.
select c.relname,c.relrowsecurity from pg_class c where c.oid in
 ('public.mcpa_equipment_request_modes'::regclass,'public.mcpa_account_invitations'::regclass);
select tgname,tgenabled from pg_trigger where tgname in ('mcpa_request_destination_guard','mcpa_pending_invitation_guard','mcpa_integration_retirement_admins');
select count(*) as unexpected_active_incomplete_invitations
from public.mcpa_account_invitations i join public.profiles p on p.id=i.profile_id
where i.registration_required and i.accepted_at is null and p.account_status='active';
select request_mode,count(*) from public.mcpa_equipment_request_modes group by request_mode;
