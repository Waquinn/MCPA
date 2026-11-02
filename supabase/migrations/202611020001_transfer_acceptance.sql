-- LOCAL REVIEW ONLY. Never applied to a remote database by this task.
-- Requires the integrated custody lifecycle and monitoring migrations.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ declare legacy_rpc regprocedure; legacy_table text; browser_role text; dependency text; begin
  if to_regprocedure('mcpa_auth_private.movement_before_transfer_acceptance(text,jsonb,uuid)') is not null then
    raise exception 'Preflight: transfer acceptance is already installed; do not replay this migration.'; end if;
  foreach dependency in array array[
    'mcpa_auth_private.can_adjust_movement(text,public.mcpa_movements,public.profiles)',
    'mcpa_auth_private.identity()', 'mcpa_auth_private.b_individual(public.equipment)',
    'mcpa_auth_private.b_retired(uuid)', 'mcpa_auth_private.b_unresolved(uuid)',
    'mcpa_auth_private.receiving_context(text)', 'mcpa_auth_private.request_mode(text)',
    'mcpa_auth_private.wa_equipment_type(public.equipment)',
    'mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)',
    'public.mcpa_movement_action(text,jsonb,uuid)', 'public.mcpa_b_action(text,jsonb,uuid)'
  ] loop
    if to_regprocedure(dependency) is null then raise exception 'Preflight: missing dependency %',dependency; end if;
  end loop;
  foreach dependency in array array['public.profiles','public.sites','public.equipment','public.mcpa_movements',
    'public.mcpa_movement_assets','public.mcpa_movement_sites','public.mcpa_movement_reservations',
    'public.mcpa_movement_operations','public.mcpa_movement_cancellations','public.mcpa_b_operations',
    'public.mcpa_b_evidence','public.mcpa_b_return_items','public.mcpa_b_retirements',
    'public.mcpa_wa_equipment_requests','public.mcpa_notifications','public.mcpa_movement_number','mcpa_auth_private.return_office'] loop
    if to_regclass(dependency) is null then raise exception 'Preflight: missing dependency %',dependency; end if;
  end loop;
  if to_regprocedure('mcpa_auth_private.request_destination_guard()') is null
    or to_regprocedure('mcpa_auth_private.b_attach(public.profiles,jsonb,uuid[],text,text,boolean)') is null
    or to_regprocedure('mcpa_auth_private.notify_new_movement_operation()') is null
    or to_regprocedure('mcpa_auth_private.inventory_lock(uuid)') is null then
    raise exception 'Preflight: install the verified PR #4 dependencies before reviewing transfer acceptance.';
  end if;
  legacy_rpc:=to_regprocedure('public.complete_equipment_handover(uuid)');
  foreach browser_role in array array['anon','authenticated'] loop
    if legacy_rpc is not null and has_function_privilege(browser_role,legacy_rpc,'EXECUTE') then
      raise exception 'Preflight: legacy handover browser access is enabled. Review the existing legacy lockdown migration first.';
    end if;
    foreach legacy_table in array array['equipment_transfers','equipment_history'] loop
      if to_regclass('public.'||legacy_table) is not null and
        (has_table_privilege(browser_role,'public.'||legacy_table,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
         or has_any_column_privilege(browser_role,'public.'||legacy_table,'INSERT,UPDATE')) then
        raise exception 'Preflight: legacy movement table browser writes remain enabled. Review legacy lockdown first.';
      end if;
    end loop;
  end loop;
end $$;

create or replace function mcpa_auth_private.request_destination_guard() returns trigger
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
    and p.account_status='active' and p.auth_user_id is not null
    and ((p.role in ('engineer','architect') and s.assigned_engineer_id=p.id)
      or (p.role='admin' and exists(select 1 from mcpa_auth_private.return_office where singleton and site_id=s.id))) for share of s,p;
  if not found then
   raise exception 'Choose an active project assigned to the receiving custodian.' using errcode='42501';end if;
  if tg_op='INSERT' then new.data:=new.data||jsonb_build_object('destinationAuthorizationVersion',1);end if;
 end if;
 return new;
end $$;

-- Preserve incumbent field-user recovery rules; add only the original Admin sender.
alter function mcpa_auth_private.can_adjust_movement(text,public.mcpa_movements,public.profiles)
  rename to can_adjust_before_transfer_acceptance;
revoke all on function mcpa_auth_private.can_adjust_before_transfer_acceptance(text,public.mcpa_movements,public.profiles) from public,anon,authenticated,service_role;
create function mcpa_auth_private.can_adjust_movement(p_action text,m public.mcpa_movements,p public.profiles)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(mcpa_auth_private.can_adjust_before_transfer_acceptance(p_action,m,p),false)
   or (p_action='cancelTransfer' and p.role='admin' and m.kind='transfer'
       and m.actor_id=p.id and m.data->>'status'='pending');
$$;
revoke all on function mcpa_auth_private.can_adjust_movement(text,public.mcpa_movements,public.profiles) from public,anon,authenticated,service_role;

-- One condition policy for direct creation and the focused inventory snapshot.
-- Matches b_lookup's normalized transfer restrictions (202610250002).
create function mcpa_auth_private.transfer_condition_allowed(e public.equipment)
returns boolean language sql immutable set search_path='' as $$
 select regexp_replace(lower(coalesce(e.condition,'')),'[ _-]','','g')
   not in ('damaged','repair','underrepair','missing','lost');
$$;
revoke all on function mcpa_auth_private.transfer_condition_allowed(public.equipment) from public,anon,authenticated,service_role;

alter function public.mcpa_movement_action(text,jsonb,uuid) rename to movement_before_transfer_acceptance;
alter function public.movement_before_transfer_acceptance(text,jsonb,uuid) set schema mcpa_auth_private;
revoke all on function mcpa_auth_private.movement_before_transfer_acceptance(text,jsonb,uuid) from public,anon,authenticated,service_role;

create function public.mcpa_movement_action(p_action text,p_payload jsonb,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p public.profiles; recipient public.profiles; dest public.sites; m public.mcpa_movements;
  oldop public.mcpa_movement_operations; payload jsonb; result jsonb; ids jsonb; assets uuid[];
  source jsonb; e public.equipment; item jsonb; checks jsonb; entity text; reason text;
  at_text text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if p_action is null or p_action not in ('createTransfer','receiveTransfer','rejectTransfer','cancelTransfer') then
    return mcpa_auth_private.movement_before_transfer_acceptance(p_action,p_payload,p_operation_id);
  end if;
  p:=mcpa_auth_private.identity();
  if p_action='cancelTransfer' and p.role<>'admin' then
    return mcpa_auth_private.movement_before_transfer_acceptance(p_action,p_payload,p_operation_id);
  end if;
  perform 1 from public.profiles where id=p.id for share;
  p:=mcpa_auth_private.identity();
  if p.role not in ('admin','engineer','architect','tool_handler') or (p.role='tool_handler' and p_action<>'createTransfer') then
    raise exception 'Transfer access required.' using errcode='42501'; end if;
  if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>131072
    or char_length(coalesce(p_payload->>'notes',''))>2000 then
    raise exception 'Supply a valid transfer form and notes up to 2000 characters.' using errcode='22023'; end if;
  -- Same transaction lock as every incumbent movement/return/retirement mutation.
  perform pg_advisory_xact_lock(672341,2026);
  payload:=(p_payload-'actor'-'receivingToken')||jsonb_build_object('actor',jsonb_build_object('id',p.id,'name',p.name,'role',p.role));
  select * into oldop from public.mcpa_movement_operations where id=p_operation_id;
  if found then
    -- Historical receipt retries retain the incumbent actor normalization.
    if oldop.action=p_action and oldop.payload=payload then return oldop.result; end if;
    if p_action='receiveTransfer' and oldop.action=p_action and oldop.payload=
      ((p_payload-'actor')||jsonb_build_object('actor',jsonb_build_object('id',p.id,'name',p.name,'role','engineer'))) then
      return oldop.result;
    end if;
    raise exception 'Operation already saved with different values or identity.' using errcode='40001';
  end if;
  if exists(select 1 from public.mcpa_b_operations where id=p_operation_id) then
    raise exception 'Operation ID belongs to another custody action.' using errcode='40001'; end if;

  if p_action='createTransfer' then
    ids:=p_payload->'toolIds';
    if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids) not between 1 and 100
      or exists(select 1 from jsonb_array_elements(ids) x where jsonb_typeof(x)<>'string')
      or (select count(distinct value) from jsonb_array_elements(ids))<>jsonb_array_length(ids) then
      raise exception 'Choose 1 to 100 distinct individual Asset IDs.' using errcode='22023'; end if;
    select * into recipient from public.profiles where id=nullif(p_payload->>'receiverId','')::uuid for share;
    if recipient.id is null or recipient.id=p.id or recipient.account_status<>'active' or recipient.auth_user_id is null
      or recipient.role not in ('admin','engineer','architect') then
      raise exception 'Choose another active Admin, Engineer or Architect recipient.' using errcode='22023'; end if;
    select * into dest from public.sites where name=p_payload->>'destination' and is_active for share;
    if dest.id is null or (recipient.role<>'admin' and dest.assigned_engineer_id is distinct from recipient.id)
      or (recipient.role='admin' and not exists(select 1 from mcpa_auth_private.return_office where singleton and site_id=dest.id)) then
      raise exception 'Choose the recipient assigned project, or Office for an Admin recipient.' using errcode='22023'; end if;
    if p_payload ? 'receivingToken' then
      item:=mcpa_auth_private.receiving_context(p_payload->>'receivingToken');
      if item->>'receiver_id' is distinct from recipient.id::text or item->>'site_id' is distinct from dest.id::text then
        raise exception 'The receiving QR does not match the recipient and destination.' using errcode='22023'; end if;
    end if;
    select array_agg(id order by id) into assets from public.equipment where asset_id in (select jsonb_array_elements_text(ids));
    if coalesce(cardinality(assets),0)<>jsonb_array_length(ids) then raise exception 'Unknown Asset ID.' using errcode='42501'; end if;
    perform 1 from public.equipment where id=any(assets) order by id for update;
    for e in select * from public.equipment where id=any(assets) loop
      if not mcpa_auth_private.b_individual(e) or mcpa_auth_private.b_retired(e.id)
        or mcpa_auth_private.inventory_lock(e.id) is not null or mcpa_auth_private.b_unresolved(e.id)
        or regexp_replace(lower(e.status::text),'[ _-]','','g') not in ('available','inuse')
        or not mcpa_auth_private.transfer_condition_allowed(e) then
        raise exception 'Asset unavailable, reserved, retired or not an individual Asset ID.' using errcode='40001'; end if;
      if not ((e.current_holder_id=p.id and regexp_replace(lower(e.status::text),'[ _-]','','g')='inuse')
        or (p.role in ('admin','tool_handler') and e.current_holder_id is null and regexp_replace(lower(e.status::text),'[ _-]','','g')='available')) then
        raise exception 'Only your custody or authorized unheld Office stock may be transferred.' using errcode='42501'; end if;
    end loop;
    select jsonb_agg(jsonb_build_object('toolId',eq.asset_id,'name',eq.name,'site',s.name,'siteId',eq.site_id,
      'holder',h.name,'holderId',eq.current_holder_id,'dbStatus',eq.status::text,'qty',eq.quantity,'condition',eq.condition) order by eq.asset_id)
      into source from public.equipment eq left join public.sites s on s.id=eq.site_id left join public.profiles h on h.id=eq.current_holder_id where eq.id=any(assets);
    entity:='TRF-'||lpad(nextval('public.mcpa_movement_number')::text,5,'0');
    result:=jsonb_build_object('id',entity,'acceptanceVersion',1,'status','pending','sender',p.name,'senderId',p.id,'senderRole',p.role,
      'receiver',recipient.name,'receiverId',recipient.id,'destination',dest.name,'destinationId',dest.id,'toolIds',ids,'source',source,
      'notes',coalesce(p_payload->>'notes',''),'createdAt',at_text,'updatedAt',at_text);
    insert into public.mcpa_movements(id,kind,data,actor_id,receiver_id,destination_id) values(entity,'transfer',result,p.id,recipient.id,dest.id);
    insert into public.mcpa_movement_assets select entity,unnest(assets);
    insert into public.mcpa_movement_sites select entity,site_id from public.equipment where id=any(assets) and site_id is not null union select entity,dest.id;
    insert into public.mcpa_movement_reservations select unnest(assets),entity;
    -- Intentionally no UPDATE to equipment here.
  else
    select * into m from public.mcpa_movements where id=p_payload->>'id' for update;
    if p_action='cancelTransfer' then
      if m.id is null or not coalesce(mcpa_auth_private.can_adjust_movement(p_action,m,p),false) then
        raise exception 'Only the original Admin sender may cancel their pending transfer.' using errcode='42501'; end if;
    elsif m.id is null or m.kind<>'transfer' or m.receiver_id is distinct from p.id or m.data->>'status'<>'pending' then
      raise exception 'Only the named recipient may decide a pending transfer.' using errcode='42501'; end if;
    select * into dest from public.sites where id=m.destination_id for share;
    if p_action='receiveTransfer' and (not coalesce(dest.is_active,false) or (p.role<>'admin' and dest.assigned_engineer_id is distinct from p.id)
      or (p.role='admin' and not exists(select 1 from mcpa_auth_private.return_office where singleton and site_id=dest.id))) then
      raise exception 'Recipient destination eligibility changed. Ask the sender to resolve this transfer.' using errcode='40001'; end if;
    select array_agg(equipment_id order by equipment_id) into assets from public.mcpa_movement_assets where movement_id=m.id;
    if coalesce(cardinality(assets),0)=0 then raise exception 'Transfer has no equipment.' using errcode='40001'; end if;
    perform 1 from public.equipment where id=any(assets) order by id for update;
    if p_action='receiveTransfer' then
    for e in select * from public.equipment where id=any(assets) loop
      select value into item from jsonb_array_elements(m.data->'source') where value->>'toolId'=e.asset_id;
      if item is null or e.current_holder_id::text is distinct from item->>'holderId' or e.site_id::text is distinct from item->>'siteId'
        or e.status::text is distinct from item->>'dbStatus' or to_jsonb(e.quantity) is distinct from item->'qty'
        or not mcpa_auth_private.b_individual(e) or mcpa_auth_private.b_retired(e.id)
        or not mcpa_auth_private.transfer_condition_allowed(e)
        or not (e.status::text='IN_USE' and e.current_holder_id is not null
          or e.status::text='AVAILABLE' and e.current_holder_id is null)
        or exists(select 1 from public.mcpa_b_return_items where equipment_id=e.id and outcome in ('pending','missing','disputed'))
        or exists(select 1 from public.mcpa_movement_assets a join public.mcpa_movements other on other.id=a.movement_id
          where a.equipment_id=e.id and other.id<>m.id and other.id is distinct from m.data->>'requestId' and (
            (other.kind='request' and other.data->>'status' in ('pending','approved','released'))
            or (other.kind='transfer' and other.data->>'status' in ('pending','refused'))
            or (other.kind='repair' and other.data->>'status' in ('reported','underrepair'))
            or (other.kind='missing' and other.data->>'status'='missing')))
        or not exists(select 1 from public.mcpa_movement_reservations where equipment_id=e.id and movement_id=m.id) then
        raise exception 'Condition, eligibility, custody or reservation changed. Refresh and review the transfer.' using errcode='40001'; end if;
    end loop;
    end if;
    if p_action='receiveTransfer' then
      checks:=p_payload->'inspections';
      if jsonb_typeof(checks) is distinct from 'array' or jsonb_array_length(checks)<>cardinality(assets)
        or (select count(distinct x->>'toolId') from jsonb_array_elements(checks) x)<>cardinality(assets)
        or exists(select 1 from jsonb_array_elements(checks) x where coalesce(x->>'condition','') not in ('good','damaged')
          or x->'tested' is distinct from 'true'::jsonb or x->'physicallyReceived' is distinct from 'true'::jsonb
          or (x->>'condition'='damaged' and x->>'disposition' is distinct from 'accepted')) then
        raise exception 'Physically receive and test every Asset ID, or reject the transfer.' using errcode='22023'; end if;
      -- Reuse the established atomic inspection/repair and linked request engine.
      -- Recipient authority is checked above even for Admin. The older engine's
      -- internal Admin override is never exposed through a public entry point.
      result:=mcpa_auth_private.mcpa_movement_action(p_action,(p_payload-'actor')||jsonb_build_object('actor',
        jsonb_build_object('id',p.id,'name',p.name,'role',case when p.role='admin' then 'admin' else 'engineer' end)),p_operation_id);
      perform mcpa_auth_private.b_attach(p,coalesce(p_payload->'evidenceIds','[]'::jsonb),assets,'accept_transfer',m.id);
      return result;
    end if;
    if p_action='cancelTransfer' then
      reason:=btrim(p_payload->>'reason');
      if jsonb_typeof(p_payload->'reason') is distinct from 'string' or reason is null
        or char_length(reason) not between 1 and 2000 or p_payload->'confirmed' is distinct from 'true'::jsonb then
        raise exception 'Confirm cancellation and enter a reason of 1 to 2000 characters.' using errcode='22023'; end if;
      result:=m.data||jsonb_build_object('status','canceled','canceledBy',p.name,'canceledById',p.id,
        'canceledAt',at_text,'cancellationReason',reason,'updatedAt',at_text);
      if nullif(m.data->>'requestId','') is not null then
        perform 1 from public.mcpa_movements where id=m.data->>'requestId' and kind='request'
          and data->>'status'='released' and data->>'transferId'=m.id for update;
        if not found then raise exception 'Linked request changed.' using errcode='40001'; end if;
      end if;
      update public.mcpa_movements set data=result where id=m.id;
      delete from public.mcpa_movement_reservations where movement_id=m.id;
      insert into public.mcpa_movement_operations(id,action,payload,result,activity) values(p_operation_id,p_action,payload,result,
        jsonb_build_object('id',p_operation_id,'action',p_action,'entityId',m.id,'toolIds',m.data->'toolIds',
          'actor',p.name,'actorId',p.id,'role',p.role,'summary','Sender canceled pending transfer; custody unchanged. Reason: '||reason,'createdAt',at_text));
      insert into public.mcpa_movement_cancellations values(p_operation_id,m.id,p_action,p.id,p.name,p.role,reason,at_text::timestamptz,m.data,result);
      if nullif(m.data->>'requestId','') is not null then
        select data into item from public.mcpa_movements where id=m.data->>'requestId';
        checks:=item||jsonb_build_object('status','canceled','canceledBy',p.name,'canceledById',p.id,
          'canceledAt',at_text,'cancellationReason',reason,'updatedAt',at_text);
        update public.mcpa_movements set data=checks where id=m.data->>'requestId';
        insert into public.mcpa_movement_cancellations values(p_operation_id,m.data->>'requestId',p_action,p.id,p.name,p.role,reason,at_text::timestamptz,item,checks);
      end if;
      return result;
    end if;
    reason:=btrim(p_payload->>'reason');
    if reason is null or char_length(reason) not between 1 and 2000 or p_payload->'confirmed' is distinct from 'true'::jsonb then
      raise exception 'Confirm rejection and enter a reason of 1 to 2000 characters.' using errcode='22023'; end if;
    entity:=m.id;
    result:=m.data||jsonb_build_object('status','rejected','rejectedBy',p.name,'rejectedById',p.id,'rejectedAt',at_text,'rejectionReason',reason,'updatedAt',at_text);
    update public.mcpa_movements set data=result where id=m.id;
    delete from public.mcpa_movement_reservations where movement_id=m.id;
    update public.mcpa_movements set data=data||jsonb_build_object('status','canceled','cancellationReason','Recipient rejected transfer '||m.id,'updatedAt',at_text)
      where kind='request' and id=m.data->>'requestId' and data->>'transferId'=m.id and data->>'status'='released';
    -- No equipment UPDATE on rejection; no reopen transition for rejected records.
  end if;
  insert into public.mcpa_movement_operations(id,action,payload,result,activity) values(p_operation_id,p_action,payload,result,
    jsonb_build_object('id',p_operation_id,'action',p_action,'entityId',entity,'toolIds',result->'toolIds','actor',p.name,'actorId',p.id,'role',p.role,
      'summary',case when p_action='createTransfer' then 'Pending recipient acceptance; custody unchanged' else 'Recipient rejected transfer; custody unchanged: '||reason end,'createdAt',at_text));
  return result;
end $$;

create or replace function mcpa_auth_private.b_evidence_allowed(p public.profiles,asset uuid,phase text,target text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if phase in ('submit_return','submit_transfer') then
    return p.role in ('engineer','architect') and exists(select 1 from public.equipment e where e.id=asset
      and e.current_holder_id=p.id and mcpa_auth_private.b_individual(e)
      and not mcpa_auth_private.b_retired(e.id) and not mcpa_auth_private.b_unresolved(e.id)
      and regexp_replace(lower(e.status::text),'[ _-]','','g')='inuse');
  elsif phase='accept_transfer' then
    return p.role in ('admin','engineer','architect') and exists(select 1 from public.mcpa_movements m
      join public.mcpa_movement_assets a on a.movement_id=m.id where m.id=target and m.kind='transfer'
      and m.receiver_id=p.id and m.data->>'status'='pending' and a.equipment_id=asset);
  elsif phase='inspection' then
    return p.role='admin' and exists(select 1 from public.mcpa_b_return_items where movement_id=target
      and equipment_id=asset and outcome in ('pending','missing','disputed'));
  elsif phase='retirement' then
    return p.role='admin' and exists(select 1 from public.mcpa_b_retirements where id::text=target and equipment_id=asset and status='proposed');
  end if;
  return false;
end $$;

-- New focused reader; incumbent snapshots, history and RLS stay intact.
create function public.mcpa_transfer_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
  p:=mcpa_auth_private.identity();
  if p.role not in ('admin','engineer','architect','tool_handler') then raise exception 'Transfer access required.' using errcode='42501'; end if;
  return jsonb_build_object('profile',jsonb_build_object('id',p.id,'name',p.name,'role',p.role),
    'recipients',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role) order by name),'[]') from public.profiles
      where id<>p.id and role in ('admin','engineer','architect') and account_status='active' and auth_user_id is not null),
    'evidence',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from public.mcpa_b_evidence v join public.mcpa_movements m on m.id=v.movement_id where v.attached_at is not null and (p.role='admin' or m.actor_id=p.id or m.receiver_id=p.id)),
    'sites',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'assignedEngineerId',assigned_engineer_id,
      'office',exists(select 1 from mcpa_auth_private.return_office where singleton and site_id=s.id)) order by name),'[]') from public.sites s where is_active),
    'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',asset_id,'name',name,'holderId',current_holder_id) order by asset_id),'[]') from public.equipment e
      where mcpa_auth_private.b_individual(e) and not mcpa_auth_private.b_retired(e.id) and mcpa_auth_private.inventory_lock(e.id) is null and not mcpa_auth_private.b_unresolved(e.id)
      and ((e.current_holder_id=p.id and e.status::text='IN_USE') or (p.role in ('admin','tool_handler') and e.current_holder_id is null and e.status::text='AVAILABLE'))
      and mcpa_auth_private.transfer_condition_allowed(e)),
    'transfers',(select coalesce(jsonb_agg(m.data||jsonb_build_object('actorId',m.actor_id,
      'allowedActions',to_jsonb(array_remove(array[case when mcpa_auth_private.can_adjust_movement('cancelTransfer',m,p) then 'cancelTransfer' end,case when mcpa_auth_private.can_adjust_movement('reopenTransfer',m,p) then 'reopenTransfer' end],null)),
      'equipment',(select jsonb_agg(jsonb_build_object('id',e.asset_id,'name',e.name,'condition',e.condition,'holder',h.name) order by e.asset_id)
        from public.mcpa_movement_assets a join public.equipment e on e.id=a.equipment_id left join public.profiles h on h.id=e.current_holder_id where a.movement_id=m.id)) order by m.created_at desc),'[]')
      from public.mcpa_movements m where m.kind='transfer' and (p.role in ('admin','tool_handler') or m.actor_id=p.id or m.receiver_id=p.id)));
end $$;
revoke all on function public.mcpa_movement_action(text,jsonb,uuid),public.mcpa_transfer_snapshot() from public,anon,service_role;
grant execute on function public.mcpa_movement_action(text,jsonb,uuid),public.mcpa_transfer_snapshot() to authenticated;
create or replace function mcpa_auth_private.notify_new_movement_operation()
returns trigger language plpgsql security definer set search_path='' as $$
declare movement public.mcpa_movements; performer uuid; notice_title text; equipment_names text;
begin
  select * into movement from public.mcpa_movements where id=new.activity->>'entityId';
  if not found then return new; end if;
  select p.id into performer from public.profiles p where p.auth_user_id=auth.uid();
  notice_title:=case new.action
    when 'createRequest' then 'New tool request'
    when 'approveRequest' then 'Tool request approved'
    when 'rejectRequest' then 'Tool request rejected'
    when 'releaseRequest' then 'Tools released'
    when 'createTransfer' then 'Transfer Pending Acceptance'
    when 'receiveTransfer' then 'Transfer Accepted'
    when 'withdrawRequest' then 'Tool request withdrawn'
    when 'cancelReservation' then 'Reservation cancelled'
    when 'cancelTransfer' then 'Transfer cancelled'
    when 'refuseTransfer' then 'Equipment handover refused'
    when 'reopenTransfer' then 'Equipment handover reopened'
    when 'createReturn' then 'Equipment return recorded'
    when 'reportRepair' then 'Equipment repair reported'
    when 'startRepair' then 'Equipment repair started'
    when 'completeRepair' then 'Equipment repair completed'
    when 'reportMissing' then 'Equipment reported missing'
    when 'recoverMissing' then 'Missing equipment recovered'
    when 'rejectTransfer' then 'Transfer Rejected'
    else 'Equipment movement updated' end;
  if new.action='releaseRequest' and movement.kind='transfer' then
    select string_agg(e.name||' ('||e.asset_id||')',', ' order by e.asset_id)
      into equipment_names from public.mcpa_movement_assets a
      join public.equipment e on e.id=a.equipment_id where a.movement_id=movement.id;
  end if;
  -- The operation insert and notice insert share the release transaction.
  -- Only its intended company profile receives the personal turnover wording;
  -- other authorized Admin observers retain the existing generic event.
  insert into public.mcpa_notifications(recipient_id,kind,entity_id,dedupe_key,title,message,data)
    select p.id,'movement',movement.id,'movement:'||new.id::text,
      case when new.action='releaseRequest' and movement.kind='transfer' and p.id=movement.receiver_id
        then 'Equipment Pending Turnover' else notice_title end,
      substring(case when new.action='releaseRequest' and movement.kind='transfer' and p.id=movement.receiver_id
        then 'Equipment from your approved request '||coalesce(movement.data->>'requestId','')||
          ' has been released and is awaiting your receipt confirmation. '||
          coalesce(equipment_names||'. ','')||'Please inspect and test each received tool before confirming receipt.'
        else coalesce(nullif(new.activity->>'summary',''),notice_title) end from 1 for 2000),
      jsonb_build_object('operationId',new.id,'action',new.action,'route',movement.kind)||
        case when new.action='releaseRequest' and movement.kind='transfer'
          then jsonb_build_object('requestId',movement.data->>'requestId','toolIds',movement.data->'toolIds')
          else '{}'::jsonb end
    from public.profiles p where p.account_status='active' and p.auth_user_id is not null
      and p.role in ('admin','engineer','architect','tool_handler')
      and (p.role='admin' or p.id=movement.actor_id or p.id=movement.receiver_id)
      and p.id is distinct from performer
    on conflict(recipient_id,dedupe_key) do nothing;
  return new;
end $$;
-- Add only a permitted role label to recipients already authorized by the incumbent reader.
alter function public.mcpa_b_snapshot() rename to custody_snapshot_before_transfer_acceptance;
alter function public.custody_snapshot_before_transfer_acceptance() set schema mcpa_auth_private;
revoke all on function mcpa_auth_private.custody_snapshot_before_transfer_acceptance() from public,anon,authenticated,service_role;
create function public.mcpa_b_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=mcpa_auth_private.custody_snapshot_before_transfer_acceptance();
 return result||jsonb_build_object('recipients',coalesce((select jsonb_agg(r||jsonb_build_object('role',p.role) order by p.id)
  from jsonb_array_elements(result->'recipients') r join public.profiles p on p.id=(r->>'id')::uuid),'[]'::jsonb));
end $$;
revoke all on function public.mcpa_b_snapshot() from public,anon,authenticated,service_role;
grant execute on function public.mcpa_b_snapshot() to authenticated;

notify pgrst,'reload schema';
commit;
