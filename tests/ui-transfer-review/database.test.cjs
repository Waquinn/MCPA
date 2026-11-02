const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,randomUUID}=require('../integration-quantity-custody-v2/fixture.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/202611020001_transfer_acceptance.sql'),'utf8');
async function setup(t){const f=await fixture(t);await require('../engineer-upgrade/fixture.cjs').upgrade(f);await f.db.exec(migration);f.act=(actor,action,payload,op=randomUUID())=>f.rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:op});return f;}
const checks=ids=>ids.map(toolId=>({toolId,condition:'good',tested:true,physicallyReceived:true,disposition:'accepted'}));
const initiate=(f,receiver=f.actors.pau,ids=['TOOL-002'])=>f.act(f.actors.sky,'createTransfer',{toolIds:ids,receiverId:receiver.id,destination:receiver.role==='admin'?'Main Office':'Main Warehouse',notes:'Local test'});

test('initiation reserves exact assets and keeps sender custody; only named recipient accepts once',async t=>{
 const f=await setup(t),a=f.actors;let op=randomUUID();const payload={toolIds:['TOOL-002'],receiverId:a.pau.id,destination:'Main Warehouse'};
 const transfer=await f.act(a.sky,'createTransfer',payload,op);assert.equal(transfer.status,'pending');assert.equal((await f.tool('TOOL-002')).current_holder_id,a.sky.id);
 assert.deepEqual(await f.act(a.sky,'createTransfer',payload,op),transfer);
 for(const actor of [a.sky,a.admin,a.architect,a.inactive,null])await assert.rejects(f.act(actor,'receiveTransfer',{id:transfer.id,inspections:checks(payload.toolIds)}));
 await assert.rejects(initiate(f),/unavailable/);
 await assert.rejects(f.act(a.pau,'receiveTransfer',{id:transfer.id,inspections:[{...checks(payload.toolIds)[0],physicallyReceived:false}]}),/Physically/);
 const received=await f.act(a.pau,'receiveTransfer',{id:transfer.id,inspections:checks(payload.toolIds)},op=randomUUID());
 assert.equal(received.status,'received');assert.equal((await f.tool('TOOL-002')).current_holder_id,a.pau.id);
 assert.deepEqual(await f.act(a.pau,'receiveTransfer',{id:transfer.id,inspections:checks(payload.toolIds)},op),received);
 await assert.rejects(f.act(a.pau,'receiveTransfer',{id:transfer.id,inspections:checks(payload.toolIds)}));
 assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_reservations where movement_id=$1',[transfer.id])).rows[0].n,0);
 assert.ok((await f.db.query('select count(*)::int n from mcpa_notifications where entity_id=$1',[transfer.id])).rows[0].n>=2);
});
test('recipient rejection is terminal, audited and releases reservations without changing custody',async t=>{
 const f=await setup(t),a=f.actors,tr=await initiate(f),before=await f.tool('TOOL-002');
 await assert.rejects(f.act(a.admin,'rejectTransfer',{id:tr.id,reason:'Not mine',confirmed:true}));
 await assert.rejects(f.act(a.pau,'rejectTransfer',{id:tr.id,reason:' ',confirmed:true}));
 const result=await f.act(a.pau,'rejectTransfer',{id:tr.id,reason:'Incorrect destination',confirmed:true});
 assert.equal(result.status,'rejected');assert.equal(result.rejectedById,a.pau.id);assert.ok(result.rejectedAt);
 assert.deepEqual(await f.tool('TOOL-002'),before);
 for(const action of ['receiveTransfer','reopenTransfer'])await assert.rejects(f.act(action==='reopenTransfer'?a.sky:a.pau,action,{id:tr.id,inspections:checks(tr.toolIds),reason:'Reopen',confirmed:true}));
 assert.equal((await initiate(f)).status,'pending');
 assert.ok((await f.db.query("select 1 from mcpa_movement_operations where action='rejectTransfer' and result->>'id'=$1",[tr.id])).rows.length);
});
test('Admin is a recipient with explicit acceptance and can dispatch own or unheld stock',async t=>{
 const f=await setup(t),a=f.actors,tr=await initiate(f,a.admin);
 assert.equal((await f.tool('TOOL-002')).current_holder_id,a.sky.id);
 await assert.rejects(f.act(a.admin2,'receiveTransfer',{id:tr.id,inspections:checks(tr.toolIds)}));
 await f.act(a.admin,'receiveTransfer',{id:tr.id,inspections:checks(tr.toolIds)});
 assert.equal((await f.tool('TOOL-002')).current_holder_id,a.admin.id);
 const next=await f.act(a.admin,'createTransfer',{toolIds:['TOOL-002'],receiverId:a.pau.id,destination:'Main Warehouse'});
 assert.equal((await f.tool('TOOL-002')).current_holder_id,a.admin.id);
 await f.act(a.pau,'rejectTransfer',{id:next.id,reason:'Wrong item',confirmed:true});
 assert.equal((await f.tool('TOOL-002')).current_holder_id,a.admin.id);
 await f.act(a.admin,'createTransfer',{toolIds:['TOOL-001'],receiverId:a.pau.id,destination:'Main Warehouse'});
 assert.equal((await f.tool('TOOL-001')).current_holder_id,null);
 await assert.rejects(f.act(a.admin,'createTransfer',{toolIds:['TOOL-003'],receiverId:a.pau.id,destination:'Main Warehouse'}),/custody/);
});
test('failed multi-asset acceptance rolls back equipment, repairs, operations and notifications',async t=>{
 const f=await setup(t),a=f.actors,tr=await initiate(f,a.pau,['TOOL-002','TOOL-003']);
 const before=await f.tool('TOOL-002'),op=randomUUID();
 const inspection=[{...checks(['TOOL-002'])[0],condition:'damaged',notes:'Guard damaged'}, {...checks(['TOOL-003'])[0],condition:'damaged',notes:''}];
 await assert.rejects(f.act(a.pau,'receiveTransfer',{id:tr.id,inspections:inspection},op),/Describe/);
 assert.deepEqual(await f.tool('TOOL-002'),before);
 assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_operations where id=$1',[op])).rows[0].n,0);
 assert.equal((await f.db.query("select count(*)::int n from mcpa_movements where kind='repair'")).rows[0].n,0);
 assert.equal((await f.db.query('select data->>\'status\' s from mcpa_movements where id=$1',[tr.id])).rows[0].s,'pending');
 assert.equal((await f.db.query('select count(*)::int n from mcpa_movement_reservations where movement_id=$1',[tr.id])).rows[0].n,2);
});
test('eligibility changes, aggregate assets and conflicting decisions cannot bypass acceptance',async t=>{
 const f=await setup(t),a=f.actors,tr=await initiate(f);
 await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.architect.id,f.sites.main]);
 await assert.rejects(f.act(a.pau,'receiveTransfer',{id:tr.id,inspections:checks(tr.toolIds)}),/eligibility/);
 await f.db.query('update sites set assigned_engineer_id=$1 where id=$2',[a.pau.id,f.sites.main]);
 const outcomes=await Promise.allSettled([f.act(a.pau,'receiveTransfer',{id:tr.id,inspections:checks(tr.toolIds)}),f.act(a.pau,'rejectTransfer',{id:tr.id,reason:'Race',confirmed:true})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 await f.db.query("insert into equipment(id,asset_id,name,quantity,tracking_type,status,current_holder_id,site_id) values($1,'BULK','Legacy stock',8,'Bulk','IN_USE',$2,$3)",[randomUUID(),a.sky.id,f.sites.casa]);
 await assert.rejects(initiate(f,a.pau,['BULK']),/individual/);
 await assert.rejects(f.query(a.pau,"select mcpa_auth_private.movement_before_transfer_acceptance('receiveTransfer','{}',gen_random_uuid())"),/permission denied/);
 await assert.rejects(f.query(a.admin,'update equipment set current_holder_id=$1 where asset_id=$2',[a.admin.id,'TOOL-003']),/permission denied/);
});
test('legacy QR gateway still enforces recipient decision; history is untouched by migration',async t=>{
 const f=await fixture(t),a=f.actors;await require('../engineer-upgrade/fixture.cjs').upgrade(f);
 const old=await f.call(a.sky,'mcpa_b_action',{p_action:'createTransfer',p_payload:{assetIds:['TOOL-002'],destinationId:f.sites.main,receiverId:a.pau.id},p_operation_id:randomUUID()});
 const history=(await f.db.query('select data from mcpa_movements order by id')).rows;
 await f.db.exec(migration);assert.deepEqual((await f.db.query('select data from mcpa_movements order by id')).rows,history);
 await f.call(a.pau,'mcpa_b_action',{p_action:'receiveTransfer',p_payload:{id:old.id,inspections:checks(old.toolIds)},p_operation_id:randomUUID()});
 assert.equal((await f.tool('TOOL-002')).current_holder_id,a.pau.id);
});
test('acceptance photo evidence is authorized and atomic for an Admin recipient',async t=>{
 const f=await setup(t),a=f.actors,tr=await initiate(f,a.admin),id=randomUUID();
 const args={assetId:'TOOL-002',phase:'accept_transfer',targetId:tr.id,mimeType:'image/png',byteSize:8};
 await assert.rejects(f.call(a.admin2,'mcpa_b_evidence_action',{p_action:'stage',p_payload:args,p_operation_id:randomUUID()}));
 const ticket=await f.call(a.admin,'mcpa_b_evidence_action',{p_action:'stage',p_payload:args,p_operation_id:id});
 await f.query(a.admin,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['mcpa-movement-evidence-v2',ticket.objectName,JSON.stringify({mimetype:'image/png',size:8})]);
 await f.call(a.admin,'mcpa_b_evidence_action',{p_action:'complete',p_payload:{},p_operation_id:id});
 await assert.rejects(f.act(a.admin,'receiveTransfer',{id:tr.id,inspections:checks(tr.toolIds),evidenceIds:[randomUUID()]}),/photo/);
 assert.equal((await f.tool('TOOL-002')).current_holder_id,a.sky.id);
 const result=await f.act(a.admin,'receiveTransfer',{id:tr.id,inspections:checks(tr.toolIds),evidenceIds:[id]});
 assert.equal(result.status,'received');
 const evidence=(await f.db.query('select movement_id,attached_at from mcpa_b_evidence where id=$1',[id])).rows[0];assert.equal(evidence.movement_id,tr.id);assert.ok(evidence.attached_at);
 const event=(await f.db.query("select activity from mcpa_movement_operations where action='receiveTransfer' and result->>'id'=$1",[tr.id])).rows[0];assert.equal(event.activity.role,'admin');
});
test('lost acceptance response recovers the same committed operation across remount',async t=>{
 const f=await setup(t),a=f.actors,tr=await initiate(f),storageData=new Map(),storage={getItem:k=>storageData.get(k)||null,setItem:(k,v)=>storageData.set(k,v)};
 const {createCustodyApi}=await import('../../js/upgrades/custody-lifecycle/api.mjs');let lose=true;
 const client={storage:{},async rpc(name,args){
  try{const data=name==='mcpa_transfer_snapshot'?(await f.query(a.pau,'select mcpa_transfer_snapshot() value')).rows[0].value:await f.rpc(a.pau,name,args);
   if(name==='mcpa_movement_action'&&lose){lose=false;throw Error('Local transport lost response after commit');}return {data};
  }catch(error){if(error.message.includes('lost response'))throw error;return {error:{message:error.message,code:error.code}};}
 }};
 const options={storage,rpcName:'mcpa_movement_action',snapshotName:'mcpa_transfer_snapshot'};
 let api=createCustodyApi(client,options);await api.snapshot();const payload={id:tr.id,inspections:checks(tr.toolIds),evidenceIds:[]};
 await assert.rejects(api.mutate('receiveTransfer',payload,'receive'),/lost response/);assert.equal((await f.tool('TOOL-002')).current_holder_id,a.pau.id);assert.equal(api.pending().length,1);
 api.dispose();api=createCustodyApi(client,options);await api.snapshot();assert.equal((await api.retryPending()).status,'received');assert.equal(api.pending().length,0);
 assert.equal((await f.db.query("select count(*)::int n from mcpa_movement_operations where action='receiveTransfer' and result->>'id'=$1",[tr.id])).rows[0].n,1);
 api.dispose();
});
test('quantity release still awaits acceptance, and inspected returns preserve the existing lifecycle',async t=>{
 const f=await setup(t),a=f.actors;
 const imported=await f.call(a.admin,'mcpa_import_equipment_v2',{p_operation_id:randomUUID(),p_rows:[{source_row:2,name:'Acceptance regression drill',category:'Power Tools',tracking_type:'Individual',quantity:2,condition:'Good'}]});
 const catalog=await f.call(a.sky,'mcpa_wa_equipment_catalog'),group=catalog.groups.find(g=>g.type_name==='Acceptance regression drill');
 const request=await f.call(a.sky,'mcpa_wa_submit_equipment',{p_operation_id:randomUUID(),p_type_id:group.type_id,p_site_id:f.sites.casa,p_quantity:2,p_purpose:'Local regression'});
 const allocated=await f.call(a.admin,'mcpa_wa_allocate_equipment',{p_operation_id:randomUUID(),p_request_id:request.id,p_asset_ids:imported.assets.map(v=>v.id)});
 const transfer=await f.act(a.admin,'releaseRequest',{id:allocated.movement_id});
 const ids=imported.assets.map(v=>v.asset_id);for(const id of ids)assert.equal((await f.tool(id)).current_holder_id,null);
 await assert.rejects(f.act(a.admin,'receiveTransfer',{id:transfer.id,inspections:checks(ids)}));
 await f.act(a.sky,'receiveTransfer',{id:transfer.id,inspections:checks(ids)});
 for(const id of ids)assert.equal((await f.tool(id)).current_holder_id,a.sky.id);
 const returned=await f.call(a.sky,'mcpa_b_action',{p_action:'submitReturn',p_payload:{assetIds:ids,destinationId:f.sites.office},p_operation_id:randomUUID()});
 await f.call(a.admin,'mcpa_b_action',{p_action:'inspectReturn',p_payload:{id:returned.id,inspections:ids.map(assetId=>({assetId,outcome:'good',physicallyReceived:true}))},p_operation_id:randomUUID()});
 for(const id of ids){const asset=await f.tool(id);assert.equal(asset.current_holder_id,null);assert.equal(asset.status,'AVAILABLE');assert.equal(asset.quantity,1);}
});
test('migration preflight refuses an available legacy handover bypass without changing history',async t=>{
 const f=await fixture(t);await require('../engineer-upgrade/fixture.cjs').upgrade(f);
 await f.db.exec("create function public.complete_equipment_handover(uuid) returns boolean language sql security definer as $$ select true $$");
 const before=(await f.db.query('select data from mcpa_movements order by id')).rows;
 await assert.rejects(f.db.exec(migration),/legacy handover browser access/);await f.db.exec('rollback');
 assert.deepEqual((await f.db.query('select data from mcpa_movements order by id')).rows,before);
 await f.db.exec('revoke all on function public.complete_equipment_handover(uuid) from public,anon,authenticated');
 await f.db.exec(migration);
});
