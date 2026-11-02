const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,randomUUID}=require('../integration-quantity-custody-v2/fixture.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/202611020001_transfer_acceptance.sql'),'utf8');
const preflight=fs.readFileSync(path.join(__dirname,'../../supabase/transfer-acceptance-preflight.sql'),'utf8');
async function setup(t,install=true){const f=await fixture(t);await require('../engineer-upgrade/fixture.cjs').upgrade(f);if(install)await f.db.exec(migration);f.act=(who,action,payload,op=randomUUID())=>f.rpc(who,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:op});return f;}
const send=f=>f.act(f.actors.admin,'createTransfer',{toolIds:['TOOL-001'],receiverId:f.actors.pau.id,destination:'Main Warehouse'});
const inspect=(ids=['TOOL-001'])=>ids.map(toolId=>({toolId,condition:'good',tested:true,physicallyReceived:true}));
const decide=(f,tr,action='receiveTransfer',more={})=>f.act(f.actors.pau,action,{id:tr.id,inspections:inspect(),reason:'Condition changed',confirmed:true,...more});
const state=async f=>(await f.db.query("select (select jsonb_agg(to_jsonb(e) order by asset_id) from equipment e) equipment,(select jsonb_agg(to_jsonb(m) order by id) from mcpa_movements m) movements,(select jsonb_agg(to_jsonb(o) order by id) from mcpa_movement_operations o) operations,(select jsonb_agg(to_jsonb(e) order by id) from mcpa_b_evidence e) evidence,(select jsonb_agg(to_jsonb(r) order by equipment_id) from mcpa_movement_reservations r) reservations")).rows[0];
const runPreflight=async f=>(await f.db.exec(preflight)).flatMap(r=>r.rows);

test('H2 pending condition drift rejects acceptance atomically, preserves repair and permits rejection',async t=>{
 const f=await setup(t),tr=await send(f);await f.query(f.actors.handler,"update equipment set condition='Under Repair' where asset_id='TOOL-001'");
 const before=await state(f);await assert.rejects(decide(f,tr),/Condition, eligibility/);assert.deepEqual(await state(f),before);
 assert.equal((await decide(f,tr,'rejectTransfer')).status,'rejected');assert.equal((await f.tool('TOOL-001')).condition,'Under Repair');
 assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_reservations where movement_id=$1',[tr.id])).rows[0].n,0);
});
test('H2 sender cancellation releases reservation after pending condition drift',async t=>{
 const f=await setup(t),tr=await send(f);await f.db.query("update equipment set condition='Under Repair',status='REPAIR' where asset_id='TOOL-001'");const before=await f.tool('TOOL-001');
 assert.equal((await f.act(f.actors.admin,'cancelTransfer',{id:tr.id,reason:'Repair required',confirmed:true})).status,'canceled');assert.deepEqual(await f.tool('TOOL-001'),before);
 assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_reservations where movement_id=$1',[tr.id])).rows[0].n,0);
});
test('H2 valid good receipt and explicitly accepted inspected damage preserve incumbent repair workflow',async t=>{
 for(const condition of ['good','damaged']){const f=await setup(t),tr=await send(f);const result=await decide(f,tr,'receiveTransfer',{inspections:[{...inspect()[0],condition,disposition:'accepted',notes:condition==='damaged'?'Guard damaged during transport':''}]});assert.equal(result.status,'received');const e=await f.tool('TOOL-001');assert.equal(e.current_holder_id,f.actors.pau.id);assert.equal(e.status,condition==='good'?'IN_USE':'REPAIR');}
});
test('H2 recorded ineligible conditions block initiation and never overwrite existing condition',async t=>{
 const f=await setup(t);for(const condition of ['Under Repair','under_repair','Damaged','Missing','Lost']){await f.db.query('update equipment set condition=$1 where asset_id=$2',[condition,'TOOL-001']);const before=await state(f);await assert.rejects(send(f));assert.deepEqual(await state(f),before);}
});
test('H2 multi-asset failure rolls back all receipt/history/evidence updates after recorded drift',async t=>{
 const f=await setup(t),tr=await f.act(f.actors.sky,'createTransfer',{toolIds:['TOOL-002','TOOL-003'],receiverId:f.actors.pau.id,destination:'Main Warehouse'});
 await f.db.query("update equipment set condition='Under Repair' where asset_id='TOOL-003'");const before=await state(f);await assert.rejects(decide(f,tr,'receiveTransfer',{inspections:inspect(['TOOL-002','TOOL-003'])}));assert.deepEqual(await state(f),before);
});
test('H2 another unresolved repair and source/reservation drift block acceptance without blocking rejection',async t=>{
 const f=await setup(t),tr=await send(f);const id='REPAIR-SYNTHETIC';await f.db.query("insert into mcpa_movements(id,kind,data,actor_id) values($1,'repair',$2,$3)",[id,{id,status:'reported'},f.actors.admin.id]);await f.db.query('insert into mcpa_movement_assets(movement_id,equipment_id) select $1,id from equipment where asset_id=$2',[id,'TOOL-001']);
 const before=await state(f);await assert.rejects(decide(f,tr),/Condition, eligibility/);assert.deepEqual(await state(f),before);assert.equal((await decide(f,tr,'rejectTransfer')).status,'rejected');
});
test('M3 QR snapshot adds permitted recipient roles only and preserves authorization',async t=>{
 const f=await setup(t),snap=await f.call(f.actors.sky,'mcpa_b_snapshot');assert.ok(snap.recipients.every(r=>['engineer','architect'].includes(r.role)));assert.ok(snap.recipients.every(r=>Object.keys(r).sort().join(',')==='id,name,role'));
 await assert.rejects(f.call(f.actors.secretary,'mcpa_b_snapshot'));const tr=await send(f);await assert.rejects(f.act(f.actors.architect,'receiveTransfer',{id:tr.id,inspections:inspect()}));
});
test('M5 expected baseline has no FAIL; preflight is read only and exposes review limits',async t=>{
 const f=await setup(t,false),before=await state(f),rows=await runPreflight(f);assert.ok(rows.length>300);assert.deepEqual(rows.filter(r=>r.status==='FAIL'),[]);assert.deepEqual(await state(f),before);assert.equal(rows.find(r=>r.check_name==='live.provenance-and-concurrency').status,'REVIEW_REQUIRED');
 const statements=preflight.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''").split(';').map(s=>s.trim()).filter(Boolean);for(const stmt of statements)assert.match(stmt,/^(begin read only|with|select|rollback)\b/i);
});
for(const [name,mutation,check]of [
 ['missing PR4 helper',"alter function mcpa_auth_private.request_mode(text) rename to missing_request_mode",'definition.mcpa_auth_private.request_mode(text)'],
 ['changed definition',"create or replace function mcpa_auth_private.b_unresolved(asset uuid) returns boolean language sql stable security definer set search_path='' as $$select false$$",'definition.mcpa_auth_private.b_unresolved(uuid)'],
 ['unsafe inherited effective grant',"grant execute on function mcpa_auth_private.b_unresolved(uuid) to public",'execute.authenticated.mcpa_auth_private.b_unresolved(uuid)'],
 ['missing reservation uniqueness',"alter table mcpa_movement_reservations drop constraint mcpa_movement_reservations_pkey",'reservation.unique-equipment'],
 ['disabled guard',"alter table equipment disable trigger mcpa_b_equipment_guard",'trigger.mcpa_b_equipment_guard'],
 ['wrong function owner',"alter function mcpa_auth_private.b_unresolved(uuid) owner to authenticated",'owner.mcpa_auth_private.b_unresolved(uuid)'],
 ['missing column',"alter table equipment rename column model to absent_model",'column.equipment.model'],
 ['disabled RLS',"alter table equipment disable row level security",'rls.equipment']
])test('M5 preflight detects '+name,async t=>{const f=await setup(t,false);await f.db.exec(mutation);const rows=await runPreflight(f);assert.equal(rows.find(r=>r.check_name===check)?.status,'FAIL',check);});
test('M5 pending inconsistency, unknown conditions and installed markers are explicit',async t=>{
 const f=await setup(t),tr=await send(f);await f.db.query('delete from mcpa_movement_reservations where movement_id=$1',[tr.id]);await f.db.query("update equipment set condition='Legacy Unknown' where asset_id='TOOL-001'");
 await f.db.query("insert into mcpa_movements(id,kind,data,actor_id,receiver_id,destination_id) values('LEGACY-SYNTHETIC','transfer',$1,$2,$3,$4)",[{id:'LEGACY-SYNTHETIC',status:'received',toolIds:['ABSENT-ASSET']},f.actors.admin.id,f.actors.pau.id,f.sites.main]);
 const rows=await runPreflight(f);assert.equal(rows.find(r=>r.check_name==='pending.source-custody-reservation').status,'FAIL');assert.equal(rows.find(r=>r.check_name==='equipment.condition-vocabulary').status,'REVIEW_REQUIRED');assert.equal(rows.find(r=>r.check_name==='installation.transfer-acceptance').status,'REVIEW_REQUIRED');
 assert.equal(rows.find(r=>r.check_name==='legacy.transfer-associations').status,'REVIEW_REQUIRED');
});
