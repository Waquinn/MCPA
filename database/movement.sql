-- Apply after modules/sites/setup.sql. Additive: reuses equipment_transfers and
-- equipment_history discovered in the existing database. No sample/live data.
-- PROTOTYPE ACCESS: matches Sites/Consumables; anon may invoke validated RPCs.
-- Replace these grants/policies with role checks before exposing real operations.
begin;

-- Definitions also support a fresh installation; existing tables are preserved.
create table if not exists public.equipment_transfers (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  from_user_id uuid references public.profiles(id) on delete restrict,
  to_user_id uuid references public.profiles(id) on delete restrict,
  status text default 'PENDING', created_at timestamptz not null default now()
);
create table if not exists public.equipment_history (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  action text not null, created_at timestamptz not null default now()
);
alter table public.equipment_transfers
  add column if not exists kind text,
  add column if not exists workflow_status text,
  add column if not exists from_site_id uuid references public.sites(id) on delete restrict,
  add column if not exists to_site_id uuid references public.sites(id) on delete restrict,
  add column if not exists notes text,
  add column if not exists condition text,
  add column if not exists needed_until date,
  add column if not exists repair_shop text,
  add column if not exists repair_cost numeric(12,2),
  add column if not exists actor_id uuid,
  add column if not exists expected_status text,
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();
alter table public.equipment_history
  add column if not exists movement_id uuid references public.equipment_transfers(id) on delete restrict,
  add column if not exists details jsonb,
  add column if not exists actor_id uuid;

-- Fail atomically rather than silently reshaping an incompatible legacy table.
-- Public REST can confirm columns, but cannot reveal all private constraints/defaults.
do $$
declare incompatible text; status_type oid;
begin
 select string_agg(table_name || '.' || column_name, ', ') into incompatible
 from information_schema.columns
 where table_schema='public' and is_nullable='NO' and column_default is null
   and is_identity='NO' and is_generated='NEVER'
   and ((table_name='equipment_transfers' and column_name not in
       ('id','equipment_id','kind','workflow_status','notes','condition','actor_id','expected_status'))
     or (table_name='equipment_history' and column_name not in
       ('id','equipment_id','action','movement_id','details','actor_id')));
 if incompatible is not null then
   raise exception 'Movement setup stopped: inspect required legacy columns without defaults: %', incompatible;
 end if;
 select atttypid into status_type from pg_attribute
   where attrelid='public.equipment'::regclass and attname='status';
 if exists(select 1 from pg_type where oid=status_type and typtype='e') and exists(
   select 1 from unnest(array['AVAILABLE','IN_USE','REPAIR','MISSING','DISPOSED']) value
   where not exists(select 1 from pg_enum where enumtypid=status_type and enumlabel=value)) then
   raise exception 'Movement setup stopped: equipment status enum lacks a required workflow state. Review it without removing existing values.';
 end if;
end $$;

-- Never reinterpret or rewrite original transfer status/action values. Legacy
-- transfers have kind NULL, remain visible separately, and retain their status.
comment on column public.equipment_transfers.workflow_status is
 'State of managed Movement workflows. Original status belongs to legacy transfers.';
alter table public.equipment_transfers drop constraint if exists movement_kind_check;
alter table public.equipment_transfers add constraint movement_kind_check
 check (kind is null or kind in ('request','transfer','return','repair','missing'));
alter table public.equipment_transfers drop constraint if exists movement_state_check;
alter table public.equipment_transfers add constraint movement_state_check
 check (kind is null or (workflow_status is not null and workflow_status in ('pending','approved','released','completed','cancelled','open','disposed')));
create unique index if not exists movement_one_active_equipment
 on public.equipment_transfers(equipment_id)
 where kind is not null and workflow_status in ('pending','approved','released','open');
create index if not exists movement_kind_date on public.equipment_transfers(kind,created_at desc);
create index if not exists movement_from_site on public.equipment_transfers(from_site_id);
create index if not exists movement_to_site on public.equipment_transfers(to_site_id);
create index if not exists movement_history_equipment on public.equipment_history(equipment_id,created_at desc);

-- A history record protects the equipment even if an older FK uses CASCADE.
create or replace function public.movement_protect_equipment()
returns trigger language plpgsql set search_path = '' as $$
begin
 if tg_op = 'DELETE' then
   if exists(select 1 from public.equipment_transfers where equipment_id=old.id)
      or exists(select 1 from public.equipment_history where equipment_id=old.id) then
     raise exception 'Equipment with movement history must be retained.' using errcode='23503';
   end if;
   return old;
 end if;
 if current_setting('mcpa.movement_write',true) is distinct from 'yes'
    and (new.site_id is distinct from old.site_id or new.current_holder_id is distinct from old.current_holder_id
         or new.status is distinct from old.status or new.quantity is distinct from old.quantity)
    and exists(select 1 from public.equipment_transfers where equipment_id=old.id and kind is not null
      and workflow_status in ('pending','approved','released','open')) then
   raise exception 'Resolve the open movement before changing this equipment.' using errcode='40001';
 end if;
 return new;
end; $$;
drop trigger if exists movement_equipment_guard on public.equipment;
create trigger movement_equipment_guard before update or delete on public.equipment
 for each row execute function public.movement_protect_equipment();

create or replace function public.movement_create(
 p_id uuid, p_kind text, p_equipment_id uuid, p_to_site_id uuid, p_to_user_id uuid,
 p_notes text, p_condition text default 'Good', p_needed_until date default null,
 p_repair_shop text default null, p_repair_cost numeric default null)
returns public.equipment_transfers language plpgsql security definer set search_path = '' as $$
declare e public.equipment; m public.equipment_transfers; next_status text;
begin
 if p_kind='return' and p_condition='Lost' then
   raise exception 'Lost equipment cannot be returned. Report it in Missing Tools.' using errcode='22023';
 end if;
 if p_id is null or p_kind is null or p_kind not in ('request','transfer','return','repair','missing')
    or p_notes is null or char_length(btrim(p_notes)) not between 1 and 2000
    or p_condition is null or p_condition not in ('Good','Fair','Damaged','For Repair','Missing Parts','Lost')
    or (p_condition='Lost' and p_kind<>'missing')
    or (p_kind in ('return','repair','missing') and p_to_user_id is not null)
    or (p_kind in ('repair','missing') and p_to_site_id is not null)
    or (p_repair_cost is not null and (p_repair_cost < 0 or p_repair_cost >= 10000000000 or p_repair_cost <> trunc(p_repair_cost,2)))
    or char_length(coalesce(p_repair_shop,''))>160 then
   raise exception 'Check the movement details.' using errcode='22023';
 end if;
 select * into e from public.equipment where id=p_equipment_id for update;
 if not found then raise exception 'Equipment is no longer available.' using errcode='P0002'; end if;
 select * into m from public.equipment_transfers where id=p_id;
 if found then
   if m.kind is distinct from p_kind or m.equipment_id is distinct from p_equipment_id
     or m.to_site_id is distinct from p_to_site_id or m.to_user_id is distinct from p_to_user_id
     or m.notes is distinct from btrim(p_notes) or m.condition is distinct from p_condition
     or m.needed_until is distinct from p_needed_until or m.repair_shop is distinct from nullif(btrim(p_repair_shop),'')
     or m.repair_cost is distinct from p_repair_cost then
      raise exception 'This operation ID was already used. Refresh and try again.' using errcode='40001';
   end if;
   return m;
 end if;
 if coalesce(e.quantity,1)<=0 or e.status::text='DISPOSED' then raise exception 'Equipment cannot be moved.' using errcode='22023'; end if;
 if exists(select 1 from public.equipment_transfers where equipment_id=e.id and kind is not null and workflow_status in ('pending','approved','released','open')) then
   raise exception 'This equipment already has an open movement.' using errcode='40001';
 end if;
 if p_kind='request' and (e.status::text<>'AVAILABLE' or p_to_user_id is null or p_to_site_id is null) then
   raise exception 'Requests need available equipment, a recipient and a site.' using errcode='22023';
 end if;
 if p_kind='transfer' and (e.status::text not in ('AVAILABLE','IN_USE') or p_to_site_id is null or e.site_id is not distinct from p_to_site_id) then
   raise exception 'Choose available/in-use equipment and a different destination.' using errcode='22023';
 end if;
 if p_kind='return' and (e.status::text<>'IN_USE' or p_to_site_id is null) then
   raise exception 'Only assigned equipment can be returned; select its receiving site.' using errcode='22023';
 end if;
 if p_kind='repair' and e.status::text not in ('AVAILABLE','IN_USE','REPAIR','UNDER_REPAIR') then
   raise exception 'This equipment cannot enter repair.' using errcode='22023';
 end if;
 if p_kind='missing' and e.status::text not in ('AVAILABLE','IN_USE','REPAIR','UNDER_REPAIR','MISSING') then
   raise exception 'This equipment cannot be reported missing.' using errcode='22023';
 end if;
 if p_kind='request' and p_needed_until is not null and p_needed_until < (now() at time zone 'Asia/Manila')::date then
   raise exception 'Needed-until date cannot be in the past.' using errcode='22023';
 end if;
 next_status := case when p_kind in ('repair','missing') then 'open' when p_kind='return' then 'completed' else 'pending' end;
 insert into public.equipment_transfers(id,equipment_id,from_user_id,to_user_id,kind,workflow_status,from_site_id,to_site_id,
  notes,condition,needed_until,repair_shop,repair_cost,actor_id,expected_status)
 values(p_id,e.id,e.current_holder_id,p_to_user_id,p_kind,next_status,e.site_id,p_to_site_id,btrim(p_notes),p_condition,
  p_needed_until,nullif(btrim(p_repair_shop),''),p_repair_cost,auth.uid(),e.status::text) returning * into m;
 perform set_config('mcpa.movement_write','yes',true);
 if p_kind='repair' then update public.equipment set status='REPAIR' where id=e.id;
 elsif p_kind='missing' then update public.equipment set status='MISSING' where id=e.id;
 elsif p_kind='return' then
   update public.equipment set site_id=p_to_site_id,current_holder_id=null,condition=p_condition,
     status=(jsonb_populate_record(null::public.equipment,jsonb_build_object('status',case when p_condition in ('Damaged','For Repair','Missing Parts') then 'REPAIR' else 'AVAILABLE' end))).status where id=e.id;
 end if;
 perform set_config('mcpa.movement_write','no',true);
 insert into public.equipment_history(id,equipment_id,action,movement_id,details,actor_id)
 values(gen_random_uuid(),e.id,upper(p_kind)||'_CREATED',m.id,
   jsonb_build_object('quantity',e.quantity,'kind',p_kind,'state',next_status,'from_site_id',e.site_id,'to_site_id',p_to_site_id,'from_user_id',e.current_holder_id,'to_user_id',p_to_user_id,'notes',btrim(p_notes)),auth.uid());
 -- Damaged returns open their repair case in the same transaction.
 if p_kind='return' and p_condition in ('Damaged','For Repair','Missing Parts') then
   perform public.movement_create(gen_random_uuid(),'repair',
     e.id,null,null,left('Return follow-up: '||btrim(p_notes),2000),p_condition);
 end if;
 return m;
end; $$;

create or replace function public.movement_transition(p_id uuid,p_version integer,p_action text)
returns public.equipment_transfers language plpgsql security definer set search_path = '' as $$
declare m public.equipment_transfers; e public.equipment; next_state text; equipment_uuid uuid;
begin
 -- All paths lock equipment before workflows, including create, to avoid deadlocks.
 select equipment_id into equipment_uuid from public.equipment_transfers where id=p_id;
 select * into e from public.equipment where id=equipment_uuid for update;
 select * into m from public.equipment_transfers where id=p_id for update;
 if not found or m.kind is null then raise exception 'Movement not found.' using errcode='P0002'; end if;
 if p_version is null or m.version<>p_version then raise exception 'Movement changed. Refresh and try again.' using errcode='40001'; end if;
 next_state := case
   when p_action='cancel' and m.workflow_status in ('pending','approved') then 'cancelled'
   when m.kind='request' and m.workflow_status='pending' and p_action='approve' then 'approved'
   when m.kind='request' and m.workflow_status='approved' and p_action='release' then 'released'
   when m.kind in ('request','transfer') and ((m.kind='request' and m.workflow_status='released') or (m.kind='transfer' and m.workflow_status='pending')) and p_action='receive' then 'completed'
   when m.kind='repair' and m.workflow_status='open' and p_action='repaired' then 'completed'
   when m.kind='repair' and m.workflow_status='open' and p_action='dispose' then 'disposed'
   when m.kind='missing' and m.workflow_status='open' and p_action='found' then 'completed'
   else null end;
 if next_state is null then raise exception 'This action is not available for the current movement.' using errcode='22023'; end if;
 if m.kind in ('request','transfer') and p_action<>'cancel'
   and (e.site_id is distinct from m.from_site_id or e.current_holder_id is distinct from m.from_user_id or e.status::text is distinct from m.expected_status) then
   raise exception 'Equipment changed since this movement was created.' using errcode='40001';
 end if;
 if (m.kind='repair' and e.status::text not in ('REPAIR','UNDER_REPAIR')) or (m.kind='missing' and e.status::text<>'MISSING') then
   raise exception 'Equipment state changed. Refresh before continuing.' using errcode='40001';
 end if;
 perform set_config('mcpa.movement_write','yes',true);
 if p_action='receive' then
   update public.equipment set site_id=m.to_site_id,current_holder_id=m.to_user_id,
     status=(jsonb_populate_record(null::public.equipment,jsonb_build_object('status',case when m.to_user_id is null then 'AVAILABLE' else 'IN_USE' end))).status where id=e.id;
 elsif p_action='repaired' then
   update public.equipment set status=(jsonb_populate_record(null::public.equipment,jsonb_build_object('status',case when current_holder_id is null then 'AVAILABLE' else 'IN_USE' end))).status,condition='Good' where id=e.id;
 elsif p_action='dispose' then
   update public.equipment set status='DISPOSED',current_holder_id=null where id=e.id;
 elsif p_action='found' then
   update public.equipment set status=(jsonb_populate_record(null::public.equipment,jsonb_build_object('status',case when m.expected_status in ('REPAIR','UNDER_REPAIR') then 'REPAIR' when current_holder_id is null then 'AVAILABLE' else 'IN_USE' end))).status where id=e.id;
 end if;
 perform set_config('mcpa.movement_write','no',true);
 update public.equipment_transfers set workflow_status=next_state,version=version+1,updated_at=clock_timestamp() where id=m.id returning * into m;
 insert into public.equipment_history(id,equipment_id,action,movement_id,details,actor_id)
 values(gen_random_uuid(),e.id,upper(m.kind)||'_'||upper(p_action),m.id,
   jsonb_build_object('quantity',e.quantity,'kind',m.kind,'state',next_state,'from_site_id',m.from_site_id,'to_site_id',m.to_site_id,'from_user_id',m.from_user_id,'to_user_id',m.to_user_id),auth.uid());
 return m;
end; $$;

alter table public.equipment_transfers enable row level security;
alter table public.equipment_history enable row level security;
grant select on public.equipment_transfers, public.equipment_history to anon,authenticated;
revoke insert,update,delete on public.equipment_transfers,public.equipment_history from anon,authenticated;
drop policy if exists movement_read on public.equipment_transfers;
create policy movement_read on public.equipment_transfers for select to anon,authenticated using(true);
drop policy if exists movement_history_read on public.equipment_history;
create policy movement_history_read on public.equipment_history for select to anon,authenticated using(true);
revoke all on function public.movement_create(uuid,text,uuid,uuid,uuid,text,text,date,text,numeric) from public;
revoke all on function public.movement_transition(uuid,integer,text) from public;
grant execute on function public.movement_create(uuid,text,uuid,uuid,uuid,text,text,date,text,numeric) to anon,authenticated;
grant execute on function public.movement_transition(uuid,integer,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
