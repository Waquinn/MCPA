const fs=require('fs'),crypto=require('crypto');
(async()=>{
 const f=await require('../integration-quantity-custody-v2/fixture.cjs').fixture();await require('../engineer-upgrade/fixture.cjs').upgrade(f);
 const q=async s=>(await f.db.query(s)).rows;
 const names=['identity','can_adjust_movement','request_destination_guard','b_attach','notify_new_movement_operation','inventory_lock','b_unresolved','b_individual','b_retired','receiving_context','request_mode','wa_equipment_type','mcpa_movement_action','mcpa_b_action','mcpa_b_lookup','mcpa_b_snapshot','wa_read_actor','wa_actor','integration_equipment_identity','b_equipment_guard','mcpa_wa_equipment_catalog','mcpa_wa_equipment_requests','mcpa_wa_suggest_equipment','mcpa_wa_consumables_catalog','mcpa_wa_consumables_snapshot','mcpa_wa_consumables_analytics','mcpa_import_equipment_v2_receipt'];
 const funcs=await q(`select n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' signature,md5(pg_get_functiondef(p.oid)) hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','mcpa_auth_private') and p.proname in (${names.map(n=>"'"+n+"'").join(',')}) order by 1`);
 funcs.forEach(f=>f.signature=f.signature.replace(/\b(equipment|profiles|mcpa_movements)\b/g,'public.$1'));
 const tables=['profiles','sites','equipment','mcpa_movements','mcpa_movement_assets','mcpa_movement_sites','mcpa_movement_reservations','mcpa_movement_operations','mcpa_movement_cancellations','mcpa_movement_refusals','mcpa_b_operations','mcpa_b_evidence','mcpa_b_return_items','mcpa_b_retirements','mcpa_wa_equipment_requests','mcpa_notifications'];
 const cols=await q(`select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in (${tables.map(n=>"'"+n+"'").join(',')}) order by table_name,ordinal_position`);
 const policySQL=`select md5(coalesce(string_agg(concat_ws('|',policyname,permissive,roles::text,cmd,qual,with_check),E'\\n' order by policyname),'')) from pg_policies where schemaname='public' and tablename=c.relname`;
 const policies=await q(`select c.relname,(${policySQL}) hash,c.relrowsecurity from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('equipment','mcpa_movements','mcpa_movement_reservations','mcpa_movement_operations','mcpa_movement_cancellations','mcpa_b_evidence') order by c.relname`);
 const lit=s=>"'"+s.replaceAll("'","''")+"'",values=rows=>rows.map(r=>'('+r.map(lit).join(',')+')').join(',\n ');
 let s=`-- Prepared LOCAL ONLY. This script does not authorize migration application.
-- Trusted definition/policy hashes: disposable PostgreSQL fixture built from reviewed local migrations.
-- Hash mismatch is FAIL (inspect source/target drift); existence alone never establishes equivalence.
-- Run as an authorized catalog/data reader. Permission errors or missing core relations STOP review;
-- they are not PASS. No record identifiers, names, emails or authentication IDs are returned.
-- A PASS is local compatibility evidence, not proof of live migration provenance or independent concurrency.
begin read only;
with required(name) as (values ${values([...tables.map(t=>['public.'+t]),['mcpa_auth_private.return_office'],['public.mcpa_movement_number']])})
select 'object.'||name check_name,coalesce(to_regclass(name)::text,'missing') observed,'required relation' expected,
 case when to_regclass(name) is null then 'FAIL' else 'PASS' end status,'Stop if a required relation is absent before interpreting data checks.' explanation from required;
with required(table_name,column_name,data_type) as (values ${values(cols.map(c=>[c.table_name,c.column_name,c.data_type]))})
select 'column.'||r.table_name||'.'||r.column_name check_name,coalesce(c.data_type,'missing') observed,r.data_type expected,
 case when c.data_type=r.data_type then 'PASS' else 'FAIL' end status,'Exact required column type; extra columns need separate review.' explanation
 from required r left join information_schema.columns c on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name;
with trusted(signature,hash) as (values ${values(funcs.map(f=>[f.signature,f.hash]))})
select 'definition.'||signature check_name,coalesce(md5(pg_get_functiondef(to_regprocedure(signature))),'missing') observed,hash expected,
 case when md5(pg_get_functiondef(to_regprocedure(signature)))=hash then 'PASS' else 'FAIL' end status,
 'Full local source fingerprint; inspect mismatch, do not substitute object existence.' explanation from trusted;
with trusted(signature) as (values ${values(funcs.map(f=>[f.signature]))})
select 'owner.'||signature check_name,coalesce(r.rolname,'missing') observed,'same trusted owner as equipment; never a browser role' expected,
 case when p.proowner=(select relowner from pg_class where oid=to_regclass('public.equipment')) and r.rolname not in ('anon','authenticated','service_role') then 'PASS' else 'FAIL' end status,
 'Owner consistency is checked separately from body and ACL; organizational owner approval still requires review.' explanation
 from trusted left join pg_proc p on p.oid=to_regprocedure(signature) left join pg_roles r on r.oid=p.proowner;
with signatures(signature,private) as (values ${funcs.map(f=>'('+lit(f.signature)+','+f.signature.startsWith('mcpa_auth_private.')+')').join(',\n')}), roles(role) as (values ('anon'),('authenticated'),('service_role'))
select 'execute.'||role||'.'||signature check_name,coalesce(has_function_privilege(role,to_regprocedure(signature),'EXECUTE')::text,'missing') observed,
 (not private and role='authenticated')::text expected,
 case when has_function_privilege(role,to_regprocedure(signature),'EXECUTE')=(not private and role='authenticated') then 'PASS' else 'FAIL' end status,
 'Effective EXECUTE includes inherited and PUBLIC grants.' explanation from signatures cross join roles;
with required(role,schema_name,allowed) as (values ('anon','public',true),('authenticated','public',true),('anon','mcpa_auth_private',false),('authenticated','mcpa_auth_private',false))
select 'schema.'||role||'.'||schema_name check_name,coalesce(has_schema_privilege(role,to_regnamespace(schema_name),'USAGE')::text,'missing') observed,allowed::text expected,
 case when has_schema_privilege(role,to_regnamespace(schema_name),'USAGE')=allowed then 'PASS' else 'FAIL' end status,'Schema access and function execution are independent checks.' explanation from required;
with required(table_name,hash) as (values ${values(policies.map(p=>[p.relname,p.hash]))})
select 'rls.'||r.table_name check_name,coalesce(c.relrowsecurity::text,'missing') observed,'true' expected,
 case when c.relrowsecurity then 'PASS' else 'FAIL' end status,'Browser queries must remain subject to RLS.' explanation from required r left join pg_class c on c.oid=to_regclass('public.'||r.table_name)
union all
select 'policies.'||r.table_name,coalesce((${policySQL}),'missing'),r.hash,
 case when (${policySQL})=r.hash then 'PASS' else 'FAIL' end,'Full policy set fingerprint; compare drift with reviewed source.' from required r left join pg_class c on c.oid=to_regclass('public.'||r.table_name);
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
`;
 fs.writeFileSync('supabase/transfer-acceptance-preflight.sql',s);
 const result=await f.db.exec(s);const rows=result.flatMap(r=>r.rows);fs.writeFileSync('documentation/seven-finding-remediation-20261102/preflight-baseline.json',JSON.stringify(rows,null,2));console.log(JSON.stringify({checks:rows.length,failures:rows.filter(r=>r.status==='FAIL'),review:rows.filter(r=>r.status==='REVIEW_REQUIRED')}));
 await f.db.close();
})().catch(e=>{console.error(e.message);process.exitCode=1});
