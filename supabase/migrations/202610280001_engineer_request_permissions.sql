-- Additive upgrade from Production 5ad129f. Apply only after staging review.
begin;
create table public.mcpa_equipment_request_modes (
  type_id text primary key,
  request_mode text not null check(request_mode in ('quantity','specific')),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.mcpa_equipment_request_modes enable row level security;
create index mcpa_pending_equipment_demand on public.mcpa_wa_equipment_requests(type_id) where status='pending';
revoke all on public.mcpa_equipment_request_modes from public,anon,authenticated;
-- Seed only equipment already present. Unknown types safely default to quantity.
insert into public.mcpa_equipment_request_modes(type_id,request_mode)
select distinct mcpa_auth_private.wa_equipment_type(e),'specific' from public.equipment e
where lower(btrim(e.name)) ~ '^(cement mixer|concrete mixer|heavy[ -]duty generator|plate compactor)( |$)';
create function mcpa_auth_private.request_mode(type_key text) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select request_mode from public.mcpa_equipment_request_modes where type_id=type_key),'quantity')
$$;
create function public.mcpa_set_equipment_request_mode(p_type_id text,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles;
begin
 actor:=mcpa_auth_private.wa_actor(array['admin']);
 if p_mode is null or p_mode not in ('quantity','specific') or not exists(select 1 from public.equipment e where mcpa_auth_private.wa_equipment_type(e)=p_type_id) then
  raise exception 'Choose an existing equipment type and request method.' using errcode='22023';end if;
 insert into public.mcpa_equipment_request_modes values(p_type_id,p_mode,actor.id,clock_timestamp())
 on conflict(type_id) do update set request_mode=excluded.request_mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
create function mcpa_auth_private.requestable_count(type_key text) returns bigint
language sql stable security definer set search_path='' as $$
 select greatest(0,(select count(*) from public.equipment e where mcpa_auth_private.wa_equipment_type(e)=type_key
  and e.tracking_type='Individual' and e.quantity=1 and mcpa_auth_private.wa_equipment_available(e))
  -coalesce((select sum(requested_quantity) from public.mcpa_wa_equipment_requests where type_id=type_key and status='pending'),0))::bigint
$$;
alter function public.mcpa_wa_equipment_catalog() rename to equipment_catalog_before_ux;
alter function public.equipment_catalog_before_ux() set schema mcpa_auth_private;
create function public.mcpa_wa_equipment_catalog() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=mcpa_auth_private.equipment_catalog_before_ux();
 return result||jsonb_build_object('requestClassificationVersion',1,'groups',coalesce((select jsonb_agg(g||jsonb_build_object(
  'request_mode',mcpa_auth_private.request_mode(g->>'type_id'),
  'available_quantity',greatest(0,(g->>'available_quantity')::bigint-coalesce((select sum(q.requested_quantity)
    from public.mcpa_wa_equipment_requests q where q.type_id=g->>'type_id' and q.status='pending'),0))) order by g->>'type_name',g->>'type_id')
  from jsonb_array_elements(result->'groups') g),'[]'::jsonb));
end $$;
alter function public.mcpa_wa_submit_equipment(uuid,text,uuid,integer,text) rename to submit_equipment_before_ux;
alter function public.submit_equipment_before_ux(uuid,text,uuid,integer,text) set schema mcpa_auth_private;
create function public.mcpa_wa_submit_equipment(p_operation_id uuid,p_type_id text,p_site_id uuid,p_quantity integer,p_purpose text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; replay jsonb;
begin
 actor:=mcpa_auth_private.wa_actor(array['engineer','architect']);
 perform pg_advisory_xact_lock(672341,2026);
 replay:=mcpa_auth_private.wa_replay(p_operation_id,actor.id,'submit_equipment',jsonb_build_object('type_id',p_type_id,'site_id',p_site_id,'quantity',p_quantity,'purpose',p_purpose));
 if replay is not null then return replay;end if;
 if mcpa_auth_private.request_mode(p_type_id)<>'quantity' then raise exception 'Use Request Specific Asset for this designated equipment.' using errcode='42501';end if;
 if p_quantity>mcpa_auth_private.requestable_count(p_type_id) then raise exception 'Stock is no longer available; pending requests and reservations are included. Choose another type or reduce the quantity.' using errcode='40001';end if;
 return mcpa_auth_private.submit_equipment_before_ux(p_operation_id,p_type_id,p_site_id,p_quantity,p_purpose);
end $$;
create function mcpa_auth_private.request_destination_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; asset public.equipment;
begin
 if tg_op='UPDATE' and (new.kind<>'transfer' or old.data->>'destinationAuthorizationVersion' is distinct from '1'
   or new.data->>'status' is distinct from 'received') then return new;end if;
 actor:=mcpa_auth_private.identity();
 perform pg_advisory_xact_lock(672341,2026);
 if new.kind='request' then
  -- Only actual Admin allocation may create a quantity-linked movement.
  if new.data ? 'quantityRequestId' then
   if actor.role<>'admin' or not exists(select 1 from public.mcpa_wa_equipment_requests q
    where q.id=(new.data->>'quantityRequestId')::uuid and q.requester_id=new.actor_id and q.site_id=new.destination_id and q.status='pending'
    and jsonb_array_length(new.data->'toolIds')=q.requested_quantity
    and not exists(select 1 from jsonb_array_elements_text(new.data->'toolIds') a
      where not exists(select 1 from public.equipment e where e.asset_id=a and mcpa_auth_private.wa_equipment_type(e)=q.type_id))) then
    raise exception 'Quantity allocation requires authorized Admin review.' using errcode='42501';end if;
  else
   for asset in select e.* from public.equipment e where e.asset_id in(select jsonb_array_elements_text(new.data->'toolIds')) loop
    if mcpa_auth_private.request_mode(mcpa_auth_private.wa_equipment_type(asset))<>'specific' then
     raise exception 'Use Request by Quantity for standard equipment.' using errcode='42501';end if;
   end loop;
  end if;
 elsif new.kind='transfer' then
  perform 1 from public.sites s join public.profiles p on p.id=new.receiver_id
    where s.id=new.destination_id and s.is_active is true and s.archived_at is null
    and s.assigned_engineer_id=p.id and p.account_status='active' and p.auth_user_id is not null and p.role in ('engineer','architect') for share of s,p;
  if not found then
   raise exception 'Choose an active project assigned to the receiving custodian.' using errcode='42501';end if;
  if tg_op='INSERT' then new.data:=new.data||jsonb_build_object('destinationAuthorizationVersion',1);end if;
 end if;
 return new;
end $$;
create trigger mcpa_request_destination_guard before insert or update on public.mcpa_movements
for each row when(new.kind in ('request','transfer')) execute function mcpa_auth_private.request_destination_guard();
-- Retain movement data, but restrict the retirement record and its evidence.
create or replace function mcpa_auth_private.b_can_retirement(r public.mcpa_b_retirements,p public.profiles) returns boolean
language sql stable security definer set search_path='' as $$ select p.role='admin' and p.account_status='active' $$;
alter function public.mcpa_b_snapshot() rename to custody_snapshot_before_ux;
alter function public.custody_snapshot_before_ux() set schema mcpa_auth_private;
create function public.mcpa_b_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor public.profiles;
begin
 actor:=mcpa_auth_private.identity();result:=mcpa_auth_private.custody_snapshot_before_ux();
 return result||jsonb_build_object('sites',coalesce((select jsonb_agg(s) from jsonb_array_elements(result->'sites') s
  join public.sites p on p.id=(s->>'id')::uuid join public.profiles r on r.id=p.assigned_engineer_id
  where p.is_active is true and p.archived_at is null and r.account_status='active' and r.auth_user_id is not null and r.role in ('engineer','architect')),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(e) from jsonb_array_elements(result->'events') e
    where actor.role='admin' or not exists(select 1 from public.mcpa_b_retirements r where r.id::text=e->>'entity_id')),'[]'::jsonb));
end $$;
alter function public.mcpa_movement_snapshot() rename to movement_snapshot_before_ux;
alter function public.movement_snapshot_before_ux() set schema mcpa_auth_private;
create function public.mcpa_movement_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=mcpa_auth_private.movement_snapshot_before_ux();
 return result||jsonb_build_object('requestClassificationVersion',1,'tools',coalesce((select jsonb_agg(t||jsonb_build_object('requestMode',
  mcpa_auth_private.request_mode(mcpa_auth_private.wa_equipment_type(e)))) from jsonb_array_elements(result->'tools') t
  join public.equipment e on e.asset_id=t->>'id'),'[]'::jsonb));
end $$;
revoke all on function mcpa_auth_private.request_mode(text),mcpa_auth_private.requestable_count(text),mcpa_auth_private.request_destination_guard(),
 mcpa_auth_private.equipment_catalog_before_ux(),mcpa_auth_private.submit_equipment_before_ux(uuid,text,uuid,integer,text),
 mcpa_auth_private.custody_snapshot_before_ux(),mcpa_auth_private.movement_snapshot_before_ux() from public,anon,authenticated,service_role;
revoke all on function public.mcpa_set_equipment_request_mode(text,text),public.mcpa_wa_equipment_catalog(),public.mcpa_wa_submit_equipment(uuid,text,uuid,integer,text),public.mcpa_b_snapshot(),public.mcpa_movement_snapshot() from public,anon,authenticated,service_role;
grant execute on function public.mcpa_set_equipment_request_mode(text,text),public.mcpa_wa_equipment_catalog(),public.mcpa_wa_submit_equipment(uuid,text,uuid,integer,text),public.mcpa_b_snapshot(),public.mcpa_movement_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;
