// Runs the shipped SQL in local PostgreSQL only; no Supabase/network requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('../../consumables/tests/node_modules/@electric-sql/pglite');
const db = new PGlite();
const migration = fs.readFileSync(path.join(__dirname,'../../../database/movement.sql'),'utf8');
const id = () => randomUUID();
const siteA=id(),siteB=id(),personA=id(),personB=id();
async function sql(statement,values=[]) { return (await db.query(statement,values)).rows; }
async function equipment(status='AVAILABLE',holder=null,site=siteA) {
  return (await sql('insert into equipment(id,asset_id,name,status,current_holder_id,site_id) values($1,$2,\'Test tool\',$3,$4,$5) returning *',[id(),id(),status,holder,site]))[0];
}
async function create(kind,e,site=null,holder=null,condition='Good',extra={}) {
  return (await sql('select * from movement_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[extra.id||id(),kind,e.id,site,holder,extra.notes||'Workflow test',condition,extra.date||null,extra.shop||null,extra.cost??null]))[0];
}
async function transition(m,action) {return (await sql('select * from movement_transition($1,$2,$3)',[m.id,m.version,action]))[0];}
const rejects = (operation,code) => assert.rejects(operation,e=>e.code===code);
(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;
 create schema auth;create function auth.uid() returns uuid language sql as 'select null::uuid';
 grant usage on schema public to anon,authenticated;
 create table profiles(id uuid primary key,name text,role text);
 create table sites(id uuid primary key,name text);
 create table equipment(id uuid primary key,asset_id text,name text,current_holder_id uuid references profiles(id),site_id uuid references sites(id),
 status text not null check(status in ('AVAILABLE','IN_USE','REPAIR','UNDER_REPAIR','MISSING','DISPOSED')),condition text default 'Good',quantity integer default 1);
 -- Existing discovered tables, including the legacy CASCADE relationship.
 create table equipment_transfers(id uuid primary key default gen_random_uuid(),equipment_id uuid references equipment(id) on delete cascade,
 from_user_id uuid references profiles(id),to_user_id uuid references profiles(id),status text not null default 'PENDING',created_at timestamptz default now());
 create table equipment_history(id uuid primary key default gen_random_uuid(),equipment_id uuid references equipment(id) on delete cascade,action text not null,created_at timestamptz default now());
 grant select,update on equipment to anon,authenticated;`);
 await sql('insert into sites values($1,\'Site A\'),($2,\'Site B\')',[siteA,siteB]);
 await sql('insert into profiles values($1,\'Person A\',\'admin\'),($2,\'Person B\',\'staff\')',[personA,personB]);
 const oldEquipment=await equipment(); const legacy=id();
 await sql('insert into equipment_transfers(id,equipment_id,status) values($1,$2,\'ACCEPTED\')',[legacy,oldEquipment.id]);
 await db.exec(migration);await db.exec(migration);
 assert.equal((await sql('select status from equipment_transfers where id=$1',[legacy]))[0].status,'ACCEPTED');
 assert.equal((await sql('select kind from equipment_transfers where id=$1',[legacy]))[0].kind,null);
 console.log('PASS Additive migration reruns and preserves legacy records');

 await db.exec('set role anon');
 const tool=await sql('select * from equipment where id=$1',[oldEquipment.id]);
 let request=await create('request',tool[0],siteB,personA);
 assert.equal(request.workflow_status,'pending');
 await rejects(()=>create('transfer',tool[0],siteB,personB),'40001');
 await rejects(()=>transition(request,'receive'),'22023');
 await rejects(()=>sql("update equipment set site_id=$1 where id=$2",[siteB,oldEquipment.id]),'40001');
 request=await transition(request,'approve');
 const outdated={...request};request=await transition(request,'release');
 await rejects(()=>transition(outdated,'release'),'40001');
 assert.equal((await sql('select status from equipment where id=$1',[oldEquipment.id]))[0].status,'AVAILABLE');
 request=await transition(request,'receive');
 assert.equal(request.workflow_status,'completed');
 assert.deepEqual((await sql('select site_id,current_holder_id,status from equipment where id=$1',[oldEquipment.id]))[0],{site_id:siteB,current_holder_id:personA,status:'IN_USE'});
 assert.equal((await sql('select * from equipment_history where movement_id=$1',[request.id])).length,4);
 await rejects(()=>sql('delete from equipment_transfers where id=$1',[request.id]),'42501');
 await rejects(()=>sql("insert into equipment_history(equipment_id,action)values($1,'FAKE')",[oldEquipment.id]),'42501');
 await db.exec('reset role');
 await rejects(()=>sql('delete from equipment where id=$1',[oldEquipment.id]),'23503');
 console.log('PASS Request transitions, receipt assignment, concurrency guard, restricted audit writes');

 let assigned=(await sql('select * from equipment where id=$1',[oldEquipment.id]))[0];
 const priorHistory=(await sql('select id from equipment_history where equipment_id=$1',[assigned.id])).length;
 await assert.rejects(()=>create('return',assigned,siteA,null,'Lost'),error=>error.code==='22023'&&error.message==='Lost equipment cannot be returned. Report it in Missing Tools.');
 assert.deepEqual((await sql('select * from equipment where id=$1',[assigned.id]))[0],assigned);
 assert.equal((await sql('select id from equipment_history where equipment_id=$1',[assigned.id])).length,priorHistory);
 assert.equal((await sql("select id from equipment_transfers where equipment_id=$1 and kind='return'",[assigned.id])).length,0);
 console.log('PASS Lost return rejected without changing custody, status or history');
 let transfer=await create('transfer',assigned,siteA,personB);
 transfer=await transition(transfer,'receive');
 assert.equal((await sql('select current_holder_id from equipment where id=$1',[assigned.id]))[0].current_holder_id,personB);
 const ret=await create('return',assigned,siteB,null,'Damaged');
 assert.equal(ret.workflow_status,'completed');
 assert.equal((await sql('select status from equipment where id=$1',[assigned.id]))[0].status,'REPAIR');
 let repair=(await sql("select * from equipment_transfers where equipment_id=$1 and kind='repair' and workflow_status='open'",[assigned.id]))[0];
 assert.ok(repair);repair=await transition(repair,'repaired');
 assert.equal((await sql('select status from equipment where id=$1',[assigned.id]))[0].status,'AVAILABLE');
 let missing=await create('missing',assigned);
 assert.equal((await sql('select status from equipment where id=$1',[assigned.id]))[0].status,'MISSING');
 await transition(missing,'found');
 assert.equal((await sql('select status from equipment where id=$1',[assigned.id]))[0].status,'AVAILABLE');
 console.log('PASS Transfer receipt, damaged return opens repair atomically, repair and recovery outcomes');

 const disposable=await equipment(); let disposal=await create('repair',disposable,null,null,'Good',{shop:'Actual shop',cost:125.50});
 await transition(disposal,'dispose');
 assert.equal((await sql('select status from equipment where id=$1',[disposable.id]))[0].status,'DISPOSED');
 await rejects(()=>create('missing',disposable),'22023');
 const retryTool=await equipment(); const operation=id();
 const original=await create('transfer',retryTool,siteB,null,'Good',{id:operation});
 const retry=await create('transfer',retryTool,siteB,null,'Good',{id:operation});
 assert.equal(original.id,retry.id);
 await rejects(()=>create('transfer',retryTool,siteB,null,'Good',{id:operation,notes:'Different payload'}),'40001');
 await transition(original,'cancel');
 await rejects(()=>create('transfer',retryTool,siteA),'22023');
 await rejects(()=>create('repair',retryTool,null,null,'Good',{cost:-2}),'22023');
 await rejects(()=>create('request',retryTool,siteB,null),'22023');
 await rejects(()=>create('repair',retryTool,siteB),'22023');
 await rejects(()=>create('missing',retryTool,null,personA),'22023');
 await rejects(()=>create('return',retryTool,siteB,personA),'22023');
 await rejects(()=>create('request',retryTool,siteB,personA,'Good',{date:'2000-01-01'}),'22023');
 await rejects(()=>sql('delete from sites where id=$1',[siteB]),'23503');
 console.log('PASS Disposal, cancellation, idempotent create, validation and restrictive site history');

 const atomic=await equipment();
 await db.exec(`create function fail_audit() returns trigger language plpgsql as $$begin raise exception 'simulated history failure';end;$$;
 create trigger fail_audit before insert on equipment_history for each row execute function fail_audit();`);
 await assert.rejects(()=>create('repair',atomic));
 assert.equal((await sql('select status from equipment where id=$1',[atomic.id]))[0].status,'AVAILABLE');
 assert.equal((await sql('select * from equipment_transfers where equipment_id=$1',[atomic.id])).length,0);
 await db.exec('drop trigger fail_audit on equipment_history');
 await db.exec('set role authenticated');
 const authed=await create('missing',atomic);await transition(authed,'found');await db.exec('reset role');
 console.log('PASS Failed audit rolls back equipment/workflow and authenticated access works');

 // The public API does not expose whether status is text or a PostgreSQL enum.
 // Execute every CASE assignment with the stricter actual PostgreSQL enum type.
 await db.exec(`alter table equipment drop constraint equipment_status_check;
   create type equipment_status as enum ('AVAILABLE','IN_USE','REPAIR','UNDER_REPAIR','MISSING','DISPOSED');
   alter table equipment alter column status type equipment_status using status::equipment_status;`);
 await db.exec(migration);
 const enumTool=await equipment();let enumRequest=await create('request',enumTool,siteB,personA);
 enumRequest=await transition(enumRequest,'approve');enumRequest=await transition(enumRequest,'release');await transition(enumRequest,'receive');
 await create('return',enumTool,siteA,null,'Damaged');
 let enumRepair=(await sql("select * from equipment_transfers where equipment_id=$1 and kind='repair' and workflow_status='open'",[enumTool.id]))[0];
 await transition(enumRepair,'repaired');
 const enumMissing=await create('missing',enumTool);await transition(enumMissing,'found');
 const enumTransfer=await create('transfer',enumTool,siteB);await transition(enumTransfer,'receive');
 const enumDisposal=await create('repair',enumTool);await transition(enumDisposal,'dispose');
 assert.equal((await sql('select status from equipment where id=$1',[enumTool.id]))[0].status,'DISPOSED');
 console.log('PASS All typed status assignments work with PostgreSQL enum columns');

 const incompatible=new PGlite();
 try {
   await incompatible.exec(`create role anon;create role authenticated;create table profiles(id uuid primary key);
     create table sites(id uuid primary key);create table equipment(id uuid primary key,status text);
     create table equipment_history(id uuid primary key,equipment_id uuid references equipment(id),action text,created_at timestamptz,
       external_reference text not null);`);
   await assert.rejects(()=>incompatible.exec(migration),error=>error.message.includes('required legacy columns')&&error.message.includes('external_reference'));
   await incompatible.exec('rollback');
   assert.equal((await incompatible.query("select * from information_schema.columns where table_name='equipment_history' and column_name='movement_id'")).rows.length,0);
   assert.equal((await incompatible.query("select to_regclass('public.equipment_transfers') as table_name")).rows[0].table_name,null);
   assert.equal((await incompatible.query("select is_nullable from information_schema.columns where table_name='equipment_history' and column_name='external_reference'")).rows[0].is_nullable,'NO');
 } finally {await incompatible.close();}
 console.log('PASS Incompatible legacy schema preflight rolls back every additive change');
 console.log('PASS All Movement database checks (local only)');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
