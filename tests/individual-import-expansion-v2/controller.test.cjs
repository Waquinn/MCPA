const test=require('node:test'),assert=require('node:assert/strict'),{webcrypto,randomUUID}=require('node:crypto');
const C=require('../../js/upgrades/individual-import-expansion/core.js'),{create,RPC,RECEIPT_RPC}=require('../../js/upgrades/individual-import-expansion/controller.js');
const actor={id:'11111111-1111-4111-8111-111111111111',role:'admin'};
const sheet=C.parse(Buffer.from('Item Name,Category,Tracking Type,Quantity,Condition\nShovel,Hand Tools,Individual,2,Good\nPipe,Construction Materials,Bulk,225,Fair'),'csv')[0];
const input={sheet,mapping:C.autoMap(sheet.headers)};
function storage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};}
function receipt(operation){return {operation_id:operation,actor_id:actor.id,created:3,rejected:0,spreadsheet_rows:2,expanded_records:3,assets:[
  ...[1,2].map(i=>({source_row:2,expansion_index:i,id:randomUUID(),asset_id:'T-'+String(i).padStart(16,'0'),name:'Shovel',quantity:1})),
  {source_row:3,expansion_index:1,id:randomUUID(),asset_id:'T-0000000000000003',name:'Pipe',quantity:225}]};}
function setup(rpc,extra={}){return create({client:{rpc},requireActor:()=>actor,storage:storage(),crypto:webcrypto,...extra});}
test('controller sends original rows once and verifies expanded physical asset receipt',async()=>{
  let calls=0;
  const controller=setup(async(name,args)=>{calls++;assert.equal(name,RPC);assert.equal(args.p_rows.length,2);assert.equal(args.p_rows[0].quantity,2);assert.equal(args.p_rows[1].quantity,225);assert.equal(args.p_rows[0].asset_id,undefined);return {data:receipt(args.p_operation_id)};});
  const result=await controller.confirm(input);assert.equal(result.created,3);assert.equal(calls,1);assert.equal(controller.pending(),null);
});
test('all non-Admin roles and invalid worksheets fail without an RPC or pending operation',async()=>{
  let calls=0;
  for(const role of ['engineer','architect','tool_handler','secretary',null]){
    const controller=setup(async()=>{calls++;},{requireActor:()=>({...actor,role})});await assert.rejects(controller.confirm(input),/Only Admin/);
  }
  const controller=setup(async()=>{calls++;});
  await assert.rejects(controller.confirm({...input,mapping:{}}),/Fix all/);assert.equal(calls,0);assert.equal(controller.pending(),null);
});
test('interrupted responses keep one operation and reject changed payloads; retry returns receipt',async()=>{
  let calls=0,operation;
  const controller=setup(async(name,args)=>{calls++;assert.equal(name,RPC);if(!operation){operation=args.p_operation_id;throw Error('Network disconnected');}assert.equal(args.p_operation_id,operation);return {data:receipt(operation)};});
  await assert.rejects(controller.confirm(input),/Network/);assert.equal(controller.pending().operation,operation);
  const changed={...sheet,rows:sheet.rows.map((r,i)=>i? r:{...r,values:['Different shovel',...r.values.slice(1)]})};
  await assert.rejects(controller.confirm({sheet:changed,mapping:input.mapping}),/unresolved/);assert.equal(calls,1);
  await assert.rejects(controller.abandonUncommitted(),/cannot be abandoned/);
  assert.equal((await controller.confirm(input)).created,3);assert.equal(calls,2);assert.equal(controller.pending(),null);
});
test('reload recovery calls the admin receipt RPC without needing the original spreadsheet',async()=>{
  const saved=storage();let committed;
  const first=setup(async(name,args)=>{committed=receipt(args.p_operation_id);throw Error('response interrupted');},{storage:saved});
  await assert.rejects(first.confirm(input),/interrupted/);
  const second=setup(async(name,args)=>{assert.equal(name,RECEIPT_RPC);assert.equal(args.p_operation_id,committed.operation_id);return {data:committed};},{storage:saved});
  assert.deepEqual(await second.recover(),committed);assert.equal(second.pending(),null);
});
test('malformed receipts, duplicate Asset IDs and missing provenance retain recovery state',async()=>{
  for(const mutate of [r=>{r.created=2;},r=>{r.assets[1].asset_id=r.assets[0].asset_id;},r=>{r.assets[1].expansion_index=1;},r=>{r.assets[0].quantity=2;},r=>{r.assets[0].source_row=99;},r=>{r.actor_id=randomUUID();}]){
    const controller=setup(async(name,args)=>{const r=receipt(args.p_operation_id);mutate(r);return {data:r};});
    await assert.rejects(controller.confirm(input),/receipt|verified/);assert.ok(controller.pending());
  }
});
test('duplicate clicks are blocked and a timeout cannot start a second operation',async()=>{
  let unblock;
  const controller=setup(()=>new Promise(resolve=>{unblock=resolve;}),{timeoutMs:30});
  const first=controller.confirm(input);await new Promise(resolve=>setTimeout(resolve,5));await assert.rejects(controller.confirm(input),/already in progress/);
  await assert.rejects(first,/timed out/);assert.ok(controller.pending());
  await assert.rejects(controller.abandonUncommitted(),/cannot be abandoned/);unblock({data:null});
});
test('a known rolled-back rejection can be abandoned only after a successful missing-receipt check',async()=>{
  let checked=false;
  const controller=setup(async(name)=>{if(name===RPC)return {error:{code:'23505',message:'serial conflict'}};checked=true;return {data:null};});
  await assert.rejects(controller.confirm(input),/serial conflict/);assert.equal(controller.pending().rejected,true);
  assert.equal(await controller.abandonUncommitted(),null);assert.equal(checked,true);assert.equal(controller.pending(),null);
});
test('a retry timeout revokes an earlier rollback marker',async()=>{
  let calls=0;
  const controller=setup(async()=>{if(++calls===1)return {error:{code:'23505',message:'conflict'}};return new Promise(()=>{});},{timeoutMs:10});
  await assert.rejects(controller.confirm(input),/conflict/);assert.equal(controller.pending().rejected,true);
  await assert.rejects(controller.confirm(input),/timed out/);assert.equal(controller.pending().rejected,false);await assert.rejects(controller.abandonUncommitted(),/cannot be abandoned/);
});
test('a later rejection cannot discard an earlier uncertain in-flight transaction',async()=>{
  let calls=0;
  const controller=setup(async()=>{if(++calls===1)throw Error('network');return {error:{code:'55P03',message:'lock wait timed out'}};});
  await assert.rejects(controller.confirm(input),/network/);
  await assert.rejects(controller.confirm(input),/lock wait/);
  assert.equal(controller.pending().uncertain,true);await assert.rejects(controller.abandonUncommitted(),/cannot be abandoned/);
});
test('account changes during response retain original account recovery data',async()=>{
  let live=actor;const saved=storage();
  const controller=setup(async(name,args)=>{live={...actor,id:randomUUID()};return {data:receipt(args.p_operation_id)};},{storage:saved,requireActor:()=>live});
  await assert.rejects(controller.confirm(input),/account changed/);assert.equal(saved.data.size,1);
});
