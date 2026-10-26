-- Registration is opt-in for NEW invitations; existing linked accounts stay intact.
begin;
alter table public.mcpa_account_invitations
 add column registration_required boolean not null default false,
 add column expires_at timestamptz,
 add column accepted_at timestamptz,
 add column revoked_at timestamptz;
alter function public.mcpa_invitation_step(uuid,text,jsonb) rename to invitation_step_before_registration;
alter function public.invitation_step_before_registration(uuid,text,jsonb) set schema mcpa_auth_private;
create function public.mcpa_invitation_step(p_actor uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; job public.mcpa_account_invitations; result jsonb; person public.profiles; u auth.users; token uuid;
begin
 perform pg_advisory_xact_lock(672341,2027);
 select * into actor from public.profiles where auth_user_id=p_actor and role='admin' and account_status='active';
 if actor.id is null then raise exception 'Active Admin access required.' using errcode='42501';end if;
 if p_action='prepare' then
  result:=mcpa_auth_private.invitation_step_before_registration(p_actor,p_action,p_payload);
  update public.mcpa_account_invitations set registration_required=true
    where id=(result->>'id')::uuid and state='prepared';
  return result;
 end if;
 select * into job from public.mcpa_account_invitations where id=(p_payload->>'id')::uuid for update;
 if job.id is null then raise exception 'Invitation no longer exists.' using errcode='22023';end if;
 if not job.registration_required then return mcpa_auth_private.invitation_step_before_registration(p_actor,p_action,p_payload);end if;
 if job.accepted_at is not null then raise exception 'Invitation already accepted. Use password recovery.' using errcode='22023';end if;
 if job.revoked_at is not null then raise exception 'Invitation was revoked.' using errcode='42501';end if;
 select * into person from public.profiles where id=job.profile_id for update;
 if p_action='revoke' then
  if job.lease_until>clock_timestamp() then raise exception 'Sending is in progress. Wait two minutes before revoking.' using errcode='40001';end if;
  update public.mcpa_account_invitations set revoked_at=clock_timestamp(),lease_id=null,lease_until=null where id=job.id;
  update public.profiles set account_status='inactive' where id=job.profile_id;
  insert into public.mcpa_account_audit(actor_id,profile_id,event) values(actor.id,job.profile_id,'invitation_revoked');
  return jsonb_build_object('id',job.id,'profile_id',job.profile_id);
 elsif p_action='claim' then
  if job.lease_until>clock_timestamp() or job.sent_at>clock_timestamp()-interval '60 seconds' then
   raise exception 'Wait before retrying this invitation.' using errcode='40001';end if;
  select * into u from auth.users where lower(email)=job.email;
  if u.id is not null and (u.id is distinct from person.auth_user_id and u.raw_user_meta_data->>'mcpa_invitation_id' is distinct from job.id::text) then
   raise exception 'Email already belongs to another account.' using errcode='42501';end if;
  if exists(select 1 from public.profiles where auth_user_id=u.id and id<>person.id) then raise exception 'Account already linked.' using errcode='42501';end if;
  token:=gen_random_uuid();
  update public.mcpa_account_invitations set lease_id=token,lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1 where id=job.id;
  return to_jsonb(job)||jsonb_build_object('lease_id',token,'auth_user_id',u.id,'confirmed',u.email_confirmed_at is not null);
 elsif p_action in ('finish','release') then
  if job.lease_id is null or job.lease_id is distinct from (p_payload->>'lease_id')::uuid then raise exception 'Invitation attempt changed.' using errcode='40001';end if;
  if p_action='release' then
   update public.mcpa_account_invitations set lease_id=null,lease_until=null where id=job.id;return jsonb_build_object('id',job.id);
  end if;
  select * into u from auth.users where id=(p_payload->>'auth_user_id')::uuid;
  if u.id is null or lower(u.email)<>job.email or u.invited_at is null
    or (person.auth_user_id is not null and person.auth_user_id<>u.id)
    or exists(select 1 from public.profiles where auth_user_id=u.id and id<>person.id) then raise exception 'Invitation account could not be verified.' using errcode='42501';end if;
  update public.profiles set auth_user_id=u.id,role=job.role,account_status='inactive',updated_at=clock_timestamp() where id=person.id;
  update public.mcpa_account_invitations set state='sent',sent_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours',lease_id=null,lease_until=null where id=job.id;
  insert into public.mcpa_account_audit(actor_id,profile_id,event) values(actor.id,job.profile_id,case when job.state='prepared' then 'user_invited' else 'invitation_resent' end);
  return jsonb_build_object('id',job.id,'profile_id',job.profile_id);
 end if;
 raise exception 'Unsupported invitation action.' using errcode='22023';
end $$;
-- Called only by Edge after getUser(token), never using a browser-supplied UUID.
create function public.mcpa_complete_invitation(p_user uuid,p_name text,p_finish boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.mcpa_account_invitations; person public.profiles; u auth.users;
begin
 perform pg_advisory_xact_lock(672341,2027);
 select * into u from auth.users where id=p_user;
 select * into person from public.profiles where auth_user_id=p_user for update;
 select * into job from public.mcpa_account_invitations where profile_id=person.id for update;
 if job.id is null or not job.registration_required or job.state<>'sent' or job.accepted_at is not null or job.revoked_at is not null
  or job.expires_at is null or job.expires_at<=clock_timestamp() or u.email_confirmed_at is null or lower(u.email)<>job.email
  or person.role<>job.role or person.account_status<>'inactive' then
  raise exception 'Invitation is unavailable, expired, revoked or already accepted. Ask Admin for help.' using errcode='42501';end if;
 if p_finish then
  if nullif(btrim(p_name),'') is null or length(p_name)>120 then raise exception 'Enter a full name up to 120 characters.' using errcode='22023';end if;
  update public.mcpa_account_invitations set accepted_at=clock_timestamp() where id=job.id;
  update public.profiles set name=btrim(p_name),account_status='active',updated_at=clock_timestamp() where id=person.id;
  insert into public.mcpa_account_audit(actor_id,profile_id,event) values(person.id,person.id,'invitation_accepted');
 end if;
 return jsonb_build_object('email',job.email,'name',person.name,'profile_id',person.id);
end $$;
create function mcpa_auth_private.pending_invitation_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.mcpa_account_invitations i where i.profile_id=new.id and i.registration_required and i.accepted_at is null)
  and (new.account_status='active' or new.role is distinct from old.role and old.auth_user_id is not null) then
  raise exception 'Complete or revoke the pending invitation before changing access.' using errcode='42501';end if;
 return new;
end $$;
create trigger mcpa_pending_invitation_guard before update on public.profiles for each row execute function mcpa_auth_private.pending_invitation_guard();
alter function public.mcpa_accounts() rename to accounts_before_registration;
alter function public.accounts_before_registration() set schema mcpa_auth_private;
create function public.mcpa_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=mcpa_auth_private.accounts_before_registration();
 return coalesce((select jsonb_agg(p||case when i.registration_required then jsonb_build_object('invitation_status',
  case when i.revoked_at is not null then 'Revoked' when i.accepted_at is not null then 'Accepted' when i.expires_at<=clock_timestamp() then 'Expired' else 'Pending' end,
  'invitation_pending',i.accepted_at is null and i.revoked_at is null,'invitation_expires_at',i.expires_at) else '{}'::jsonb end)
  from jsonb_array_elements(result) p left join public.mcpa_account_invitations i on i.profile_id=(p->>'id')::uuid),'[]'::jsonb);
end $$;
revoke all on function mcpa_auth_private.invitation_step_before_registration(uuid,text,jsonb),mcpa_auth_private.accounts_before_registration(),mcpa_auth_private.pending_invitation_guard() from public,anon,authenticated,service_role;
revoke all on function public.mcpa_invitation_step(uuid,text,jsonb),public.mcpa_complete_invitation(uuid,text,boolean),public.mcpa_accounts() from public,anon,authenticated,service_role;
grant execute on function public.mcpa_invitation_step(uuid,text,jsonb),public.mcpa_complete_invitation(uuid,text,boolean) to service_role;
grant execute on function public.mcpa_accounts() to authenticated;
notify pgrst,'reload schema';
commit;
