-- Prepared LOCAL ONLY. This script does not authorize migration application.
-- Trusted definition/policy hashes: disposable PostgreSQL fixture built from reviewed local migrations.
-- Hash mismatch is FAIL (inspect source/target drift); existence alone never establishes equivalence.
-- Run as an authorized catalog/data reader. Permission errors or missing core relations STOP review;
-- they are not PASS. No record identifiers, names, emails or authentication IDs are returned.
-- A PASS is local compatibility evidence, not proof of live migration provenance or independent concurrency.
begin read only;
with required(name) as (values ('public.profiles'),
 ('public.sites'),
 ('public.equipment'),
 ('public.mcpa_movements'),
 ('public.mcpa_movement_assets'),
 ('public.mcpa_movement_sites'),
 ('public.mcpa_movement_reservations'),
 ('public.mcpa_movement_operations'),
 ('public.mcpa_movement_cancellations'),
 ('public.mcpa_movement_refusals'),
 ('public.mcpa_b_operations'),
 ('public.mcpa_b_evidence'),
 ('public.mcpa_b_return_items'),
 ('public.mcpa_b_retirements'),
 ('public.mcpa_wa_equipment_requests'),
 ('public.mcpa_notifications'),
 ('mcpa_auth_private.return_office'),
 ('public.mcpa_movement_number'))
select 'object.'||name check_name,coalesce(to_regclass(name)::text,'missing') observed,'required relation' expected,
 case when to_regclass(name) is null then 'FAIL' else 'PASS' end status,'Stop if a required relation is absent before interpreting data checks.' explanation from required;
with required(table_name,column_name,data_type) as (values ('equipment','id','uuid'),
 ('equipment','asset_id','text'),
 ('equipment','name','text'),
 ('equipment','category','text'),
 ('equipment','brand','text'),
 ('equipment','model','text'),
 ('equipment','serial_number','text'),
 ('equipment','condition','text'),
 ('equipment','tracking_type','text'),
 ('equipment','unit','text'),
 ('equipment','details','text'),
 ('equipment','quantity','integer'),
 ('equipment','status','USER-DEFINED'),
 ('equipment','current_holder_id','uuid'),
 ('equipment','created_at','timestamp with time zone'),
 ('equipment','site_id','uuid'),
 ('mcpa_b_evidence','id','uuid'),
 ('mcpa_b_evidence','equipment_id','uuid'),
 ('mcpa_b_evidence','uploader_id','uuid'),
 ('mcpa_b_evidence','phase','text'),
 ('mcpa_b_evidence','target_id','text'),
 ('mcpa_b_evidence','movement_id','text'),
 ('mcpa_b_evidence','retirement_id','uuid'),
 ('mcpa_b_evidence','object_name','text'),
 ('mcpa_b_evidence','mime_type','text'),
 ('mcpa_b_evidence','byte_size','bigint'),
 ('mcpa_b_evidence','created_at','timestamp with time zone'),
 ('mcpa_b_evidence','uploaded_at','timestamp with time zone'),
 ('mcpa_b_evidence','attached_at','timestamp with time zone'),
 ('mcpa_b_operations','id','uuid'),
 ('mcpa_b_operations','actor_id','uuid'),
 ('mcpa_b_operations','action','text'),
 ('mcpa_b_operations','payload','jsonb'),
 ('mcpa_b_operations','result','jsonb'),
 ('mcpa_b_operations','created_at','timestamp with time zone'),
 ('mcpa_b_retirements','id','uuid'),
 ('mcpa_b_retirements','equipment_id','uuid'),
 ('mcpa_b_retirements','asset_id','text'),
 ('mcpa_b_retirements','disposition','text'),
 ('mcpa_b_retirements','reason','text'),
 ('mcpa_b_retirements','effective_date','date'),
 ('mcpa_b_retirements','status','text'),
 ('mcpa_b_retirements','proposed_by','uuid'),
 ('mcpa_b_retirements','created_at','timestamp with time zone'),
 ('mcpa_b_retirements','approved_by','uuid'),
 ('mcpa_b_retirements','decided_at','timestamp with time zone'),
 ('mcpa_b_retirements','decision_notes','text'),
 ('mcpa_b_return_items','movement_id','text'),
 ('mcpa_b_return_items','equipment_id','uuid'),
 ('mcpa_b_return_items','asset_id','text'),
 ('mcpa_b_return_items','source','jsonb'),
 ('mcpa_b_return_items','outcome','text'),
 ('mcpa_b_return_items','physically_received','boolean'),
 ('mcpa_b_return_items','notes','text'),
 ('mcpa_b_return_items','inspector_id','uuid'),
 ('mcpa_b_return_items','inspected_at','timestamp with time zone'),
 ('mcpa_b_return_items','finalized_movement_id','text'),
 ('mcpa_movement_assets','movement_id','text'),
 ('mcpa_movement_assets','equipment_id','uuid'),
 ('mcpa_movement_cancellations','operation_id','uuid'),
 ('mcpa_movement_cancellations','movement_id','text'),
 ('mcpa_movement_cancellations','action','text'),
 ('mcpa_movement_cancellations','actor_id','uuid'),
 ('mcpa_movement_cancellations','actor_name','text'),
 ('mcpa_movement_cancellations','actor_role','text'),
 ('mcpa_movement_cancellations','reason','text'),
 ('mcpa_movement_cancellations','canceled_at','timestamp with time zone'),
 ('mcpa_movement_cancellations','before_data','jsonb'),
 ('mcpa_movement_cancellations','after_data','jsonb'),
 ('mcpa_movement_operations','id','uuid'),
 ('mcpa_movement_operations','action','text'),
 ('mcpa_movement_operations','payload','jsonb'),
 ('mcpa_movement_operations','result','jsonb'),
 ('mcpa_movement_operations','activity','jsonb'),
 ('mcpa_movement_operations','created_at','timestamp with time zone'),
 ('mcpa_movement_refusals','operation_id','uuid'),
 ('mcpa_movement_refusals','movement_id','text'),
 ('mcpa_movement_refusals','action','text'),
 ('mcpa_movement_refusals','actor_id','uuid'),
 ('mcpa_movement_refusals','actor_name','text'),
 ('mcpa_movement_refusals','actor_role','text'),
 ('mcpa_movement_refusals','reason','text'),
 ('mcpa_movement_refusals','recorded_at','timestamp with time zone'),
 ('mcpa_movement_refusals','before_data','jsonb'),
 ('mcpa_movement_refusals','after_data','jsonb'),
 ('mcpa_movement_reservations','equipment_id','uuid'),
 ('mcpa_movement_reservations','movement_id','text'),
 ('mcpa_movement_sites','movement_id','text'),
 ('mcpa_movement_sites','site_id','uuid'),
 ('mcpa_movements','id','text'),
 ('mcpa_movements','kind','text'),
 ('mcpa_movements','data','jsonb'),
 ('mcpa_movements','actor_id','uuid'),
 ('mcpa_movements','destination_id','uuid'),
 ('mcpa_movements','receiver_id','uuid'),
 ('mcpa_movements','created_at','timestamp with time zone'),
 ('mcpa_notifications','id','uuid'),
 ('mcpa_notifications','recipient_id','uuid'),
 ('mcpa_notifications','kind','text'),
 ('mcpa_notifications','entity_id','text'),
 ('mcpa_notifications','dedupe_key','text'),
 ('mcpa_notifications','title','text'),
 ('mcpa_notifications','message','text'),
 ('mcpa_notifications','data','jsonb'),
 ('mcpa_notifications','created_at','timestamp with time zone'),
 ('mcpa_notifications','read_at','timestamp with time zone'),
 ('mcpa_wa_equipment_requests','id','uuid'),
 ('mcpa_wa_equipment_requests','requester_id','uuid'),
 ('mcpa_wa_equipment_requests','site_id','uuid'),
 ('mcpa_wa_equipment_requests','type_id','text'),
 ('mcpa_wa_equipment_requests','type_name','text'),
 ('mcpa_wa_equipment_requests','requested_quantity','integer'),
 ('mcpa_wa_equipment_requests','approved_quantity','integer'),
 ('mcpa_wa_equipment_requests','purpose','text'),
 ('mcpa_wa_equipment_requests','status','text'),
 ('mcpa_wa_equipment_requests','rejection_reason','text'),
 ('mcpa_wa_equipment_requests','movement_id','text'),
 ('mcpa_wa_equipment_requests','created_at','timestamp with time zone'),
 ('mcpa_wa_equipment_requests','updated_at','timestamp with time zone'),
 ('profiles','id','uuid'),
 ('profiles','name','text'),
 ('profiles','auth_user_id','uuid'),
 ('profiles','role','text'),
 ('profiles','account_status','text'),
 ('profiles','updated_at','timestamp with time zone'),
 ('sites','id','uuid'),
 ('sites','name','text'),
 ('sites','location','text'),
 ('sites','assigned_engineer','text'),
 ('sites','phase','text'),
 ('sites','status','text'),
 ('sites','progress','integer'),
 ('sites','last_inventory_check','date'),
 ('sites','created_at','timestamp with time zone'),
 ('sites','updated_at','timestamp with time zone'),
 ('sites','assigned_engineer_id','uuid'),
 ('sites','archived_at','timestamp with time zone'),
 ('sites','is_active','boolean'))
select 'column.'||r.table_name||'.'||r.column_name check_name,coalesce(c.data_type,'missing') observed,r.data_type expected,
 case when c.data_type=r.data_type then 'PASS' else 'FAIL' end status,'Exact required column type; extra columns need separate review.' explanation
 from required r left join information_schema.columns c on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name;
with trusted(signature,hash) as (values ('mcpa_auth_private.b_attach(public.profiles, jsonb, uuid[], text, text, boolean)','1cea70f8cefd869283f6263aee0428ac'),
 ('mcpa_auth_private.b_equipment_guard()','5ad7ee46d5965e2874925fa6ca6b43a2'),
 ('mcpa_auth_private.b_individual(public.equipment)','0e44fc6ca690fc56f884e99dfb98865f'),
 ('mcpa_auth_private.b_retired(uuid)','d35f9a257fc617d27bfc890f41896e17'),
 ('mcpa_auth_private.b_unresolved(uuid)','35b75cab2b25e134c422f720db1f7bb3'),
 ('mcpa_auth_private.can_adjust_movement(text, public.mcpa_movements, public.profiles)','0372ed39a89b65423a6fd7718f20b1d0'),
 ('mcpa_auth_private.identity()','49d7a7e6745bf558515f6dbb9d427351'),
 ('mcpa_auth_private.integration_equipment_identity()','01b4ba58f3611d70148c9c167daf18e7'),
 ('mcpa_auth_private.inventory_lock(uuid)','56350ba001c99cd4dd7bd974fcb34dce'),
 ('mcpa_auth_private.mcpa_movement_action(text, jsonb, uuid)','7d4c0a45498caffb17f6633f02bad76e'),
 ('mcpa_auth_private.notify_new_movement_operation()','50e05ffb55f13f4a79dce8f18abff8de'),
 ('mcpa_auth_private.receiving_context(text)','600dd7b09cbad35bd65732b1ae8f7820'),
 ('mcpa_auth_private.request_destination_guard()','62a5aa9232220551706b86824bb54341'),
 ('mcpa_auth_private.request_mode(text)','dd84378e208a07e6c0c39900de7a1611'),
 ('mcpa_auth_private.wa_actor(text[])','586bce91ceb3d39c7504bb13cfd3e8f3'),
 ('mcpa_auth_private.wa_equipment_type(public.equipment)','136c199f3323b7ac93b49e1dbac54f01'),
 ('mcpa_auth_private.wa_read_actor(text[])','0d778ffd00bfd5736497fbab64f7afca'),
 ('public.mcpa_b_action(text, jsonb, uuid)','a311ae1ba69f8ccd89f5e64e739ed982'),
 ('public.mcpa_b_lookup(text, text)','ac40e15afe30af8c5446c3351374dee9'),
 ('public.mcpa_b_snapshot()','3ca33bd10145dbcd99b9030feded240c'),
 ('public.mcpa_import_equipment_v2_receipt(uuid)','9b1952b69058d31559286b0be1faaa75'),
 ('public.mcpa_movement_action(text, jsonb, uuid)','fb9ab3740871c48149a37a8eba74545a'),
 ('public.mcpa_wa_consumables_analytics(timestamp with time zone, timestamp with time zone)','9bf4974d78d1722e095d6c8628ce2a81'),
 ('public.mcpa_wa_consumables_catalog()','4ab5213bdf00f7ca380f731dca39ab1d'),
 ('public.mcpa_wa_consumables_snapshot()','6924f7c83a727beb233364632472bcaa'),
 ('public.mcpa_wa_equipment_catalog()','1bcd347137d04576dff1fc13aa04475f'),
 ('public.mcpa_wa_equipment_requests()','c25e2ffc4ca3b572c9097db99d697260'),
 ('public.mcpa_wa_suggest_equipment(uuid)','3f1bbefc2d54321d653429bc2ca3e342'))
select 'definition.'||signature check_name,coalesce(md5(pg_get_functiondef(to_regprocedure(signature))),'missing') observed,hash expected,
 case when md5(pg_get_functiondef(to_regprocedure(signature)))=hash then 'PASS' else 'FAIL' end status,
 'Full local source fingerprint; inspect mismatch, do not substitute object existence.' explanation from trusted;
with trusted(signature) as (values ('mcpa_auth_private.b_attach(public.profiles, jsonb, uuid[], text, text, boolean)'),
 ('mcpa_auth_private.b_equipment_guard()'),
 ('mcpa_auth_private.b_individual(public.equipment)'),
 ('mcpa_auth_private.b_retired(uuid)'),
 ('mcpa_auth_private.b_unresolved(uuid)'),
 ('mcpa_auth_private.can_adjust_movement(text, public.mcpa_movements, public.profiles)'),
 ('mcpa_auth_private.identity()'),
 ('mcpa_auth_private.integration_equipment_identity()'),
 ('mcpa_auth_private.inventory_lock(uuid)'),
 ('mcpa_auth_private.mcpa_movement_action(text, jsonb, uuid)'),
 ('mcpa_auth_private.notify_new_movement_operation()'),
 ('mcpa_auth_private.receiving_context(text)'),
 ('mcpa_auth_private.request_destination_guard()'),
 ('mcpa_auth_private.request_mode(text)'),
 ('mcpa_auth_private.wa_actor(text[])'),
 ('mcpa_auth_private.wa_equipment_type(public.equipment)'),
 ('mcpa_auth_private.wa_read_actor(text[])'),
 ('public.mcpa_b_action(text, jsonb, uuid)'),
 ('public.mcpa_b_lookup(text, text)'),
 ('public.mcpa_b_snapshot()'),
 ('public.mcpa_import_equipment_v2_receipt(uuid)'),
 ('public.mcpa_movement_action(text, jsonb, uuid)'),
 ('public.mcpa_wa_consumables_analytics(timestamp with time zone, timestamp with time zone)'),
 ('public.mcpa_wa_consumables_catalog()'),
 ('public.mcpa_wa_consumables_snapshot()'),
 ('public.mcpa_wa_equipment_catalog()'),
 ('public.mcpa_wa_equipment_requests()'),
 ('public.mcpa_wa_suggest_equipment(uuid)'))
select 'owner.'||signature check_name,coalesce(r.rolname,'missing') observed,'same trusted owner as equipment; never a browser role' expected,
 case when p.proowner=(select relowner from pg_class where oid=to_regclass('public.equipment')) and r.rolname not in ('anon','authenticated','service_role') then 'PASS' else 'FAIL' end status,
 'Owner consistency is checked separately from body and ACL; organizational owner approval still requires review.' explanation
 from trusted left join pg_proc p on p.oid=to_regprocedure(signature) left join pg_roles r on r.oid=p.proowner;
with signatures(signature,private) as (values ('mcpa_auth_private.b_attach(public.profiles, jsonb, uuid[], text, text, boolean)',true),
('mcpa_auth_private.b_equipment_guard()',true),
('mcpa_auth_private.b_individual(public.equipment)',true),
('mcpa_auth_private.b_retired(uuid)',true),
('mcpa_auth_private.b_unresolved(uuid)',true),
('mcpa_auth_private.can_adjust_movement(text, public.mcpa_movements, public.profiles)',true),
('mcpa_auth_private.identity()',true),
('mcpa_auth_private.integration_equipment_identity()',true),
('mcpa_auth_private.inventory_lock(uuid)',true),
('mcpa_auth_private.mcpa_movement_action(text, jsonb, uuid)',true),
('mcpa_auth_private.notify_new_movement_operation()',true),
('mcpa_auth_private.receiving_context(text)',true),
('mcpa_auth_private.request_destination_guard()',true),
('mcpa_auth_private.request_mode(text)',true),
('mcpa_auth_private.wa_actor(text[])',true),
('mcpa_auth_private.wa_equipment_type(public.equipment)',true),
('mcpa_auth_private.wa_read_actor(text[])',true),
('public.mcpa_b_action(text, jsonb, uuid)',false),
('public.mcpa_b_lookup(text, text)',false),
('public.mcpa_b_snapshot()',false),
('public.mcpa_import_equipment_v2_receipt(uuid)',false),
('public.mcpa_movement_action(text, jsonb, uuid)',false),
('public.mcpa_wa_consumables_analytics(timestamp with time zone, timestamp with time zone)',false),
('public.mcpa_wa_consumables_catalog()',false),
('public.mcpa_wa_consumables_snapshot()',false),
('public.mcpa_wa_equipment_catalog()',false),
('public.mcpa_wa_equipment_requests()',false),
('public.mcpa_wa_suggest_equipment(uuid)',false)), roles(role) as (values ('anon'),('authenticated'),('service_role'))
select 'execute.'||role||'.'||signature check_name,coalesce(has_function_privilege(role,to_regprocedure(signature),'EXECUTE')::text,'missing') observed,
 (not private and role='authenticated')::text expected,
 case when has_function_privilege(role,to_regprocedure(signature),'EXECUTE')=(not private and role='authenticated') then 'PASS' else 'FAIL' end status,
 'Effective EXECUTE includes inherited and PUBLIC grants.' explanation from signatures cross join roles;
with required(role,schema_name,allowed) as (values ('anon','public',true),('authenticated','public',true),('anon','mcpa_auth_private',false),('authenticated','mcpa_auth_private',false))
select 'schema.'||role||'.'||schema_name check_name,coalesce(has_schema_privilege(role,to_regnamespace(schema_name),'USAGE')::text,'missing') observed,allowed::text expected,
 case when has_schema_privilege(role,to_regnamespace(schema_name),'USAGE')=allowed then 'PASS' else 'FAIL' end status,'Schema access and function execution are independent checks.' explanation from required;
with required(table_name,hash) as (values ('equipment','9aaad61f501a614bb8f33d85ba5906f4'),
 ('mcpa_b_evidence','d41d8cd98f00b204e9800998ecf8427e'),
 ('mcpa_movement_cancellations','d41d8cd98f00b204e9800998ecf8427e'),
 ('mcpa_movement_operations','d41d8cd98f00b204e9800998ecf8427e'),
 ('mcpa_movement_reservations','d41d8cd98f00b204e9800998ecf8427e'),
 ('mcpa_movements','d41d8cd98f00b204e9800998ecf8427e'))
select 'rls.'||r.table_name check_name,coalesce(c.relrowsecurity::text,'missing') observed,'true' expected,
 case when c.relrowsecurity then 'PASS' else 'FAIL' end status,'Browser queries must remain subject to RLS.' explanation from required r left join pg_class c on c.oid=to_regclass('public.'||r.table_name)
union all
select 'policies.'||r.table_name,coalesce((select md5(coalesce(string_agg(concat_ws('|',policyname,permissive,roles::text,cmd,qual,with_check),E'\n' order by policyname),'')) from pg_policies where schemaname='public' and tablename=c.relname),'missing'),r.hash,
 case when (select md5(coalesce(string_agg(concat_ws('|',policyname,permissive,roles::text,cmd,qual,with_check),E'\n' order by policyname),'')) from pg_policies where schemaname='public' and tablename=c.relname)=r.hash then 'PASS' else 'FAIL' end,'Full policy set fingerprint; compare drift with reviewed source.' from required r left join pg_class c on c.oid=to_regclass('public.'||r.table_name);
with sensitive(column_name) as (values ('current_holder_id'),('site_id'),('status'),('quantity')),roles(role) as (values ('anon'),('authenticated'))
select 'custody-column.'||role||'.'||column_name check_name,has_column_privilege(role,'public.equipment',column_name,'UPDATE')::text observed,(role='authenticated' and column_name='quantity')::text expected,
 case when has_column_privilege(role,'public.equipment',column_name,'UPDATE')=(role='authenticated' and column_name='quantity') then 'PASS' else 'FAIL' end status,'Custody writes stay closed; incumbent bulk quantity grant requires the separately fingerprinted integration identity guard and RLS.' explanation from sensitive cross join roles;
with sensitive(table_name) as (values ('mcpa_movements'),('mcpa_movement_reservations'),('mcpa_movement_operations'),('mcpa_movement_cancellations'),('equipment_transfers'),('equipment_history')),roles(role) as (values ('anon'),('authenticated'))
select 'table-writes.'||role||'.'||table_name check_name,case when to_regclass('public.'||table_name) is null then 'absent' else (has_table_privilege(role,'public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') or has_any_column_privilege(role,'public.'||table_name,'INSERT,UPDATE'))::text end observed,'false or legacy table absent' expected,
 case when to_regclass('public.'||table_name) is null and table_name in ('equipment_transfers','equipment_history') then 'PASS'
 when to_regclass('public.'||table_name) is null then 'FAIL'
 when not (has_table_privilege(role,'public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') or has_any_column_privilege(role,'public.'||table_name,'INSERT,UPDATE')) then 'PASS' else 'FAIL' end status,'Direct browser movement writes bypass audited operations and must stay closed.' explanation from sensitive cross join roles;
select 'legacy-handover.execute.'||role check_name,coalesce(has_function_privilege(role,to_regprocedure('public.complete_equipment_handover(uuid)'),'EXECUTE')::text,'absent') observed,'false or absent' expected,
 case when coalesce(has_function_privilege(role,to_regprocedure('public.complete_equipment_handover(uuid)'),'EXECUTE'),false) then 'FAIL' else 'PASS' end status,'Legacy compatibility cannot reopen unaudited custody paths.' explanation from (values ('anon'),('authenticated')) r(role);
with required(table_name,trigger_name,function_name) as (values
 ('equipment','mcpa_b_equipment_guard','mcpa_auth_private.b_equipment_guard()'),
 ('equipment','mcpa_integration_equipment_identity','mcpa_auth_private.integration_equipment_identity()'),
 ('equipment','mcpa_new_equipment_office','mcpa_auth_private.new_equipment_office()'),
 ('mcpa_movements','mcpa_request_destination_guard','mcpa_auth_private.request_destination_guard()'),
 ('mcpa_movements','mcpa_b_new_return_guard','mcpa_auth_private.b_movement_guard()'),
 ('mcpa_movement_operations','mcpa_future_movement_notifications','mcpa_auth_private.notify_new_movement_operation()'))
select 'trigger.'||trigger_name check_name,coalesce(t.tgenabled::text,'missing') observed,'enabled O or A, correct function' expected,
 case when t.tgenabled in ('O','A') and t.tgfoid=to_regprocedure(function_name) then 'PASS' else 'FAIL' end status,'A disabled or replica-only guard does not protect normal transactions.' explanation
 from required left join pg_trigger t on t.tgrelid=to_regclass('public.'||table_name) and t.tgname=trigger_name and not t.tgisinternal;
select 'reservation.unique-equipment' check_name,count(*)::text observed,'at least one validated, immediate unique equipment_id constraint' expected,
 case when count(*)>0 then 'PASS' else 'FAIL' end status,'One reservation per physical asset is required.' explanation
 from pg_constraint c where c.conrelid=to_regclass('public.mcpa_movement_reservations') and c.contype in ('p','u') and c.convalidated and not c.condeferrable
 and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='equipment_id')]::smallint[];
with required(table_name,column_name,target,target_column) as (values
 ('mcpa_movement_reservations','equipment_id','equipment','id'),('mcpa_movement_reservations','movement_id','mcpa_movements','id'),
 ('mcpa_movement_assets','equipment_id','equipment','id'),('mcpa_movement_assets','movement_id','mcpa_movements','id'))
select 'association-fk.'||r.table_name||'.'||r.column_name check_name,count(c.oid)::text observed,'one validated restrictive foreign key' expected,
 case when count(c.oid)=1 then 'PASS' else 'FAIL' end status,'Associations must refer to real equipment and movement records.' explanation
 from required r left join pg_constraint c on c.conrelid=to_regclass('public.'||r.table_name) and c.confrelid=to_regclass('public.'||r.target) and c.contype='f' and c.convalidated and c.confdeltype in ('r','a')
 and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname=r.column_name)]::smallint[]
 and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname=r.target_column)]::smallint[] group by r.table_name,r.column_name;
select 'equipment.status-enum' check_name,coalesce(string_agg(enumlabel,',' order by enumsortorder),'missing') observed,'AVAILABLE,IN_USE,REPAIR,MISSING,DISPOSED' expected,
 case when string_agg(enumlabel,',' order by enumsortorder)='AVAILABLE,IN_USE,REPAIR,MISSING,DISPOSED' then 'PASS' else 'FAIL' end status,'Exact enum order and values from trusted schema.' explanation
 from pg_enum where enumtypid=(select atttypid from pg_attribute where attrelid=to_regclass('public.equipment') and attname='status');
select 'equipment.condition-vocabulary' check_name,count(*)::text observed,'zero unknown condition values' expected,
 case when count(*)=0 then 'PASS' else 'REVIEW_REQUIRED' end status,'Counts only. Unexpected legacy values require policy review; never assume eligibility.' explanation
 from public.equipment where lower(regexp_replace(coalesce(condition,''),'[[:space:]_-]','','g')) not in ('good','fair','damaged','repair','underrepair','missing','lost','needsinspection','notassessed');
select 'pending.source-custody-reservation' check_name,count(*)::text observed,'zero incompatible pending assets' expected,
 case when count(*)=0 then 'PASS' else 'FAIL' end status,'Compare locked-at-send source custody with current records and exact reservation ownership; no identifiers exported.' explanation
 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id join public.equipment e on e.id=a.equipment_id
 left join public.mcpa_movement_reservations r on r.equipment_id=e.id
 where m.kind='transfer' and m.data->>'status'='pending' and
 (r.movement_id is distinct from m.id or not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(m.data->'source')='array' then m.data->'source' else '[]'::jsonb end) x
 where x->>'toolId'=e.asset_id and x->>'holderId' is not distinct from e.current_holder_id::text and x->>'siteId' is not distinct from e.site_id::text
 and x->>'dbStatus'=e.status::text and x->'qty'=to_jsonb(e.quantity)));
select 'pending.associations' check_name,count(*)::text observed,'zero malformed transfer associations' expected,
 case when count(*)=0 then 'PASS' else 'FAIL' end status,'Validate tool IDs, source cardinality, destination association and linked released request. No history is rewritten.' explanation
 from public.mcpa_movements m where m.kind='transfer' and m.data->>'status'='pending' and (
 jsonb_typeof(m.data->'toolIds') is distinct from 'array' or jsonb_typeof(m.data->'source') is distinct from 'array'
 or jsonb_array_length(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end)=0
 or (select count(*) from public.mcpa_movement_assets a where a.movement_id=m.id)<>jsonb_array_length(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end)
 or jsonb_array_length(case when jsonb_typeof(m.data->'source')='array' then m.data->'source' else '[]'::jsonb end)<>(select count(*) from public.mcpa_movement_assets a where a.movement_id=m.id)
 or (select count(distinct x->>'toolId') from jsonb_array_elements(case when jsonb_typeof(m.data->'source')='array' then m.data->'source' else '[]'::jsonb end) x)<>(select count(*) from public.mcpa_movement_assets a where a.movement_id=m.id)
 or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end) x where not exists(select 1 from public.mcpa_movement_assets a join public.equipment e on e.id=a.equipment_id where a.movement_id=m.id and e.asset_id=x))
 or m.actor_id is null or m.receiver_id is null or m.destination_id is null
 or not exists(select 1 from public.mcpa_movement_sites ms where ms.movement_id=m.id and ms.site_id=m.destination_id)
 or (nullif(m.data->>'requestId','') is not null and not exists(select 1 from public.mcpa_movements req where req.id=m.data->>'requestId' and req.kind='request' and req.data->>'status'='released' and req.data->>'transferId'=m.id)));
select 'pending.current-eligibility' check_name,count(*)::text observed,'zero pending assets requiring rejection/cancellation recovery' expected,
 case when count(*)=0 then 'PASS' else 'REVIEW_REQUIRED' end status,'Condition drift never grants acceptance; resolve unsafe pending transfers through authorized rejection/cancellation.' explanation
 from public.mcpa_movements m join public.mcpa_movement_assets a on a.movement_id=m.id join public.equipment e on e.id=a.equipment_id
 where m.kind='transfer' and m.data->>'status'='pending' and (e.status::text not in ('AVAILABLE','IN_USE')
 or lower(regexp_replace(coalesce(e.condition,''),'[[:space:]_-]','','g')) in ('damaged','repair','underrepair','missing','lost'));
select 'legacy.receipt-provenance' check_name,count(*)::text observed,'zero received transfers without complete acceptance inspection evidence' expected,
 case when count(*)=0 then 'PASS' else 'REVIEW_REQUIRED' end status,'Historical receipt does not prove full acceptance. Keep conservative presentation; do not rewrite records.' explanation
 from public.mcpa_movements m where m.kind='transfer' and m.data->>'status'='received' and (
 jsonb_typeof(m.data->'inspections') is distinct from 'array' or jsonb_typeof(m.data->'toolIds') is distinct from 'array'
 or jsonb_array_length(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end)=0
 or jsonb_array_length(case when jsonb_typeof(m.data->'inspections')='array' then m.data->'inspections' else '[]'::jsonb end)<>jsonb_array_length(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end)
 or (select count(distinct i->>'toolId') from jsonb_array_elements(case when jsonb_typeof(m.data->'inspections')='array' then m.data->'inspections' else '[]'::jsonb end) i)<>jsonb_array_length(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end)
 or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end) x where not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(m.data->'inspections')='array' then m.data->'inspections' else '[]'::jsonb end) i where i->>'toolId'=x))
 or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(m.data->'inspections')='array' then m.data->'inspections' else '[]'::jsonb end) i where coalesce(i->>'condition','') not in ('good','damaged') or i->'tested' is distinct from 'true'::jsonb or i->'physicallyReceived' is distinct from 'true'::jsonb or (i->>'condition'='damaged' and i->>'disposition' is distinct from 'accepted')));
select 'legacy.transfer-associations' check_name,count(*)::text observed,'zero historical transfers with missing or inconsistent asset associations' expected,
 case when count(*)=0 then 'PASS' else 'REVIEW_REQUIRED' end status,'Historical associations require review when absent or inconsistent; never infer acceptance or rewrite history.' explanation
 from public.mcpa_movements m where m.kind='transfer' and m.data->>'status'<>'pending' and (
 jsonb_typeof(m.data->'toolIds') is distinct from 'array'
 or jsonb_array_length(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end)=0
 or (select count(*) from public.mcpa_movement_assets a where a.movement_id=m.id)<>jsonb_array_length(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end)
 or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(m.data->'toolIds')='array' then m.data->'toolIds' else '[]'::jsonb end) x
 where not exists(select 1 from public.mcpa_movement_assets a join public.equipment e on e.id=a.equipment_id where a.movement_id=m.id and e.asset_id=x))
 or m.receiver_id is null or m.destination_id is null
 or not exists(select 1 from public.mcpa_movement_sites ms where ms.movement_id=m.id and ms.site_id=m.destination_id));
select 'office.configuration' check_name,count(*)::text observed,'exactly one active, unarchived configured Office' expected,
 case when count(*)=1 then 'PASS' else 'FAIL' end status,'Admin destinations derive from this authoritative singleton; no names or IDs exported.' explanation
 from mcpa_auth_private.return_office c join public.sites s on s.id=c.site_id where c.singleton and s.is_active and s.archived_at is null;
select 'destination.assignments' check_name,count(*)::text observed,'zero active assigned projects with inactive or unsupported recipients' expected,
 case when count(*)=0 then 'PASS' else 'REVIEW_REQUIRED' end status,'Assignment UUID and active Engineer/Architect identity define eligibility.' explanation
 from public.sites s left join public.profiles p on p.id=s.assigned_engineer_id where s.is_active and s.archived_at is null and s.assigned_engineer_id is not null and (p.id is null or p.account_status<>'active' or p.auth_user_id is null or p.role not in ('engineer','architect'));
select 'installation.transfer-acceptance' check_name,
 (to_regprocedure('mcpa_auth_private.movement_before_transfer_acceptance(text,jsonb,uuid)') is not null or to_regprocedure('public.mcpa_transfer_snapshot()') is not null or to_regprocedure('mcpa_auth_private.transfer_condition_allowed(equipment)') is not null or to_regprocedure('mcpa_auth_private.custody_snapshot_before_transfer_acceptance()') is not null)::text observed,'false: migration not installed' expected,
 case when to_regprocedure('mcpa_auth_private.movement_before_transfer_acceptance(text,jsonb,uuid)') is not null or to_regprocedure('public.mcpa_transfer_snapshot()') is not null or to_regprocedure('mcpa_auth_private.transfer_condition_allowed(equipment)') is not null or to_regprocedure('mcpa_auth_private.custody_snapshot_before_transfer_acceptance()') is not null then 'REVIEW_REQUIRED' else 'PASS' end status,'Any installed or partially installed marker means stop: never replay the prepared migration.' explanation;
select 'live.provenance-and-concurrency' check_name,'not established by catalog inspection' observed,'independently verified release provenance and separate PostgreSQL sessions' expected,'REVIEW_REQUIRED' status,'Offline hashes and serialized PGlite cannot establish these connected-environment gates.' explanation;
rollback;
