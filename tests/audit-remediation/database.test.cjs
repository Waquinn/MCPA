const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,randomUUID}=require('../integration-quantity-custody-v2/fixture.cjs');
async function setup(t){const f=await fixture(t);await require('../engineer-upgrade/fixture.cjs').upgrade(f);await f.db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/202611020001_transfer_acceptance.sql'),'utf8'));f.act=(a,action,payload,op=randomUUID())=>f.rpc(a,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:op});return f;}
const inspect=id=>[{toolId:id,condition:'good',tested:true,physicallyReceived:true,disposition:'accepted'}];
const cancel=id=>({id,reason:'Recipient unavailable',confirmed:true});
const send=(f,from,to,id='TOOL-001',destination)=>f.act(from,'createTransfer',{toolIds:[id],receiverId:to.id,destination:destination||(to.role==='admin'?'Main Office':'Main Warehouse')});
test('H1 Admin owner cancels after recipient deactivation; reservations and custody stay consistent; retry audited once',async t=>{
 const f=await setup(t),a=f.actors,before=await f.tool('TOOL-001'),tr=await send(f,a.admin,a.pau),op=randomUUID();
 const snapshot=(await f.query(a.admin,'select mcpa_transfer_snapshot() v')).rows[0].v;
 assert.ok(snapshot.transfers.find(v=>v.id===tr.id).allowedActions.includes('cancelTransfer'));
 await assert.rejects(f.act(a.admin2,'cancelTransfer',cancel(tr.id)),/original Admin sender/);
 await assert.rejects(f.act(a.pau,'cancelTransfer',cancel(tr.id)));
 await f.db.query("update profiles set account_status='inactive' where id=$1",[a.pau.id]);
 const result=await f.act(a.admin,'cancelTransfer',cancel(tr.id),op);assert.equal(result.status,'canceled');
 assert.deepEqual(await f.act(a.admin,'cancelTransfer',cancel(tr.id),op),result);
 assert.deepEqual(await f.tool('TOOL-001'),before);
 assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_reservations where movement_id=$1',[tr.id])).rows[0].n,0);
 assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_cancellations where movement_id=$1',[tr.id])).rows[0].n,1);
 assert.equal((await f.db.query("select count(*)::int n from mcpa_movement_operations where action='cancelTransfer' and result->>'id'=$1",[tr.id])).rows[0].n,1);
 await assert.rejects(f.act(a.admin,'cancelTransfer',cancel(tr.id)));
 await f.db.query("update profiles set account_status='active' where id=$1",[a.pau.id]);
 await assert.rejects(f.act(a.pau,'receiveTransfer',{id:tr.id,inspections:inspect('TOOL-001')}));
});
test('H1 Engineer and Architect cancellation still use their authorized incumbent recovery path',async t=>{
 const f=await setup(t),a=f.actors;
 for(const [from,id]of [[a.sky,'TOOL-002'],[a.architect,'TOOL-003']]){
  if(from===a.architect)await f.db.query('update equipment set current_holder_id=$1 where asset_id=$2',[from.id,id]);
  const before=await f.tool(id),tr=await send(f,from,a.pau,id);assert.equal((await f.act(from,'cancelTransfer',cancel(tr.id))).status,'canceled');assert.deepEqual(await f.tool(id),before);
 }
});
test('H1 terminal accepted/rejected transfers cannot be canceled by Admin sender',async t=>{
 const f=await setup(t),a=f.actors;
 for(const decision of ['receiveTransfer','rejectTransfer']){
  const tr=await send(f,a.admin,a.pau);await f.act(a.pau,decision,decision==='receiveTransfer'?{id:tr.id,inspections:inspect('TOOL-001')}:{id:tr.id,reason:'Wrong tool',confirmed:true});
  await assert.rejects(f.act(a.admin,'cancelTransfer',cancel(tr.id)));
  if(decision==='receiveTransfer')await f.db.query("update equipment set current_holder_id=null,status='AVAILABLE' where asset_id='TOOL-001'");
 }
});
test('H1 cancellation rollback preserves reservation, custody and both audit streams on failure',async t=>{
 const f=await setup(t),a=f.actors,tr=await send(f,a.admin,a.pau),before=await f.tool('TOOL-001'),op=randomUUID();
 await f.db.exec("create function fail_cancel_test() returns trigger language plpgsql as $$ begin raise exception 'Injected audit failure'; end $$; create trigger fail_cancel_test before insert on mcpa_movement_cancellations for each row execute function fail_cancel_test()");
 await assert.rejects(f.act(a.admin,'cancelTransfer',cancel(tr.id),op),/Injected audit failure/);
 assert.deepEqual(await f.tool('TOOL-001'),before);
 assert.equal((await f.db.query('select data->>\'status\' s from mcpa_movements where id=$1',[tr.id])).rows[0].s,'pending');
 assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_reservations where movement_id=$1',[tr.id])).rows[0].n,1);
 for(const table of ['mcpa_movement_operations','mcpa_notifications'])assert.equal((await f.db.query(`select count(*)::int n from ${table} where ${table==='mcpa_movement_operations'?'id=$1':"data->>'operationId'=$1::text"}`,[op])).rows[0].n,0);
});
test('H1 queued cancellation/acceptance produces one terminal result (serialized fixture, NOT independent concurrency)',async t=>{
 const f=await setup(t),a=f.actors,tr=await send(f,a.admin,a.pau);
 const results=await Promise.allSettled([f.act(a.admin,'cancelTransfer',cancel(tr.id)),f.act(a.pau,'receiveTransfer',{id:tr.id,inspections:inspect('TOOL-001')})]);
 assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal((await f.tool('TOOL-001')).current_holder_id,null);
});
test('H2 normalized Under Repair conditions blocked in direct, QR lookup, QR action and focused snapshot',async t=>{
 const f=await setup(t),a=f.actors;
 for(const condition of ['Under Repair','under_repair','UNDER-REPAIR','underrepair']){
  await f.db.query('update equipment set condition=$1 where asset_id=$2',[condition,'TOOL-002']);
  await assert.rejects(send(f,a.sky,a.pau,'TOOL-002'),/unavailable/);
  await assert.rejects(f.call(a.sky,'mcpa_b_lookup',{p_reference:'TOOL-002',p_intent:'transfer'}),/unavailable/);
  await assert.rejects(f.call(a.sky,'mcpa_b_action',{p_action:'createTransfer',p_payload:{assetIds:['TOOL-002'],receiverId:a.pau.id,destinationId:f.sites.main},p_operation_id:randomUUID()}),/unavailable/);
  assert.ok(!(await f.query(a.sky,'select mcpa_transfer_snapshot() v')).rows[0].v.assets.some(v=>v.id==='TOOL-002'));
 }
});
test('H2 eligible own In Use and unheld Available preserved; conflicting holder and reservation blocked',async t=>{
 const f=await setup(t),a=f.actors;const tr=await send(f,a.sky,a.pau,'TOOL-002');
 await assert.rejects(send(f,a.sky,a.pau,'TOOL-002'),/unavailable/);
 await assert.rejects(send(f,a.admin,a.pau,'TOOL-003'),/custody/);
 await f.act(a.sky,'cancelTransfer',cancel(tr.id));await send(f,a.admin,a.pau);
 await f.db.query("update equipment set condition='Good',status='REPAIR' where asset_id='TOOL-004'");
 await assert.rejects(send(f,a.sky,a.pau,'TOOL-004'),/unavailable/);
});
test('M5 identical name and role profiles remain distinct recipients; UUID controls decision authorization',async t=>{
 const f=await setup(t),a=f.actors;await f.db.query('update profiles set name=$1 where id=$2',[a.admin.name,a.admin2.id]);
 const tr=await send(f,a.sky,a.admin,'TOOL-002');
 await assert.rejects(f.act(a.admin2,'receiveTransfer',{id:tr.id,inspections:inspect('TOOL-002')}));
 await assert.rejects(f.act(a.admin2,'rejectTransfer',{id:tr.id,reason:'Wrong recipient',confirmed:true}));
 await f.act(a.admin,'receiveTransfer',{id:tr.id,inspections:inspect('TOOL-002')});assert.equal((await f.tool('TOOL-002')).current_holder_id,a.admin.id);
});
test('transfer role matrix: Admin to Admin/Architect, Architect to Engineer, Engineer to Admin',async t=>{
 const f=await setup(t),a=f.actors;
 await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.architect.id,f.sites.casa]);
 for(const [from,to,dest]of [[a.admin,a.admin2,'Main Office'],[a.admin2,a.architect,'Casa Buena'],[a.architect,a.pau,'Main Warehouse'],[a.pau,a.admin,'Main Office']]){
  const before=await f.tool('TOOL-001'),tr=await send(f,from,to,'TOOL-001',dest);assert.deepEqual(await f.tool('TOOL-001'),before);
  await f.act(to,'receiveTransfer',{id:tr.id,inspections:inspect('TOOL-001')});assert.equal((await f.tool('TOOL-001')).current_holder_id,to.id);
 }
});
test('H2 retirement and unresolved movement restrictions survive the corrected migration',async t=>{
 const f=await setup(t),a=f.actors;
 const proposal=await f.action(a.admin,'proposeRetirement',{assetId:'TOOL-001',disposition:'disposed',reason:'End of service',effectiveDate:'2026-10-01'});
 await f.action(a.admin2,'approveRetirement',{id:proposal.id});
 await assert.rejects(send(f,a.admin,a.pau,'TOOL-001'),/unavailable/);
 await f.db.query("insert into mcpa_movements(id,kind,data,actor_id) values('LOCAL-REPAIR','repair',$1,$2)",[JSON.stringify({status:'reported',toolId:'TOOL-004'}),a.sky.id]);
 await f.db.query("insert into mcpa_movement_assets(movement_id,equipment_id) select 'LOCAL-REPAIR',id from equipment where asset_id='TOOL-004'");
 await assert.rejects(send(f,a.sky,a.pau,'TOOL-004'),/unavailable/);
 await assert.rejects(f.call(a.sky,'mcpa_b_lookup',{p_reference:'TOOL-004',p_intent:'transfer'}),/unavailable/);
});
test('migration forbids blind replay and keeps private recovery/engine permissions closed',async t=>{
 const f=await setup(t),a=f.actors,before=(await f.db.query('select data from mcpa_movements order by id')).rows;
 await assert.rejects(f.db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/202611020001_transfer_acceptance.sql'),'utf8')),/already installed/);await f.db.exec('rollback');
 assert.deepEqual((await f.db.query('select data from mcpa_movements order by id')).rows,before);
 for(const signature of ['mcpa_auth_private.movement_before_transfer_acceptance(text,jsonb,uuid)','mcpa_auth_private.can_adjust_before_transfer_acceptance(text,public.mcpa_movements,public.profiles)','mcpa_auth_private.can_adjust_movement(text,public.mcpa_movements,public.profiles)','mcpa_auth_private.transfer_condition_allowed(public.equipment)']){
  for(const role of ['anon','authenticated','service_role'])assert.equal((await f.db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,signature])).rows[0].allowed,false);
 }
 for(const actor of [a.admin,a.admin2,a.sky])await assert.rejects(f.query(actor,"select mcpa_auth_private.movement_before_transfer_acceptance('receiveTransfer','{}',gen_random_uuid())"),/permission denied/);
});
test('prepared read-only preflight SQL parses and finds required baseline objects in disposable local fixture',async t=>{
 const f=await fixture(t);await require('../engineer-upgrade/fixture.cjs').upgrade(f);
 const results=await f.db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/transfer-acceptance-preflight.sql'),'utf8'));
 const requirements=results.flatMap(r=>r.rows||[]).filter(r=>Object.hasOwn(r,'check_name'));
 assert.ok(requirements.length>300);assert.deepEqual(requirements.filter(r=>r.status==='FAIL'),[]);assert.ok(requirements.some(r=>r.status==='REVIEW_REQUIRED'));
});
