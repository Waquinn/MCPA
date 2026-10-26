// Current authenticated Sites contract; real local SQL/RLS, never hosted SQL.
// The historical prototype-access.sql is intentionally not applied: anonymous
// CRUD and physical deletion contradict the current role/archive safeguards.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {authDatabase}=require('../../../../tests/auth-test-db.cjs');
const {upgrade}=require('../../../../tests/project-construction-fixture.cjs');
const fixture=async t=>{const f=await authDatabase({engineerPortal:true});t.after(()=>f.close());await upgrade(f);return f;};
const save=(f,actor,id,version,patch,operation=randomUUID())=>f.rpc(actor,'mcpa_save_project',{p_id:id,p_version:version,p_operation_id:operation,p_patch:patch,p_reason:'Local QA'});
test('Sites rejects anonymous and non-Admin writes and keeps project history immutable',async t=>{
 const f=await fixture(t),before=(await f.db.query('select * from equipment order by id')).rows;
 for(const actor of [null,f.actors.sky,f.actors.architect,f.actors.secretary,f.actors.handler,f.actors.inactive]){
  await assert.rejects(save(f,actor,null,null,{name:'Forbidden project',location:'Test'}),e=>e.code==='42501');
  await assert.rejects(f.query(actor,'delete from sites'),e=>e.code==='42501');
 }
 await assert.rejects(f.query(f.actors.admin,'delete from sites'),e=>e.code==='42501');
 await assert.rejects(f.query(f.actors.admin,'delete from project_history'),e=>e.code==='42501');
 assert.deepEqual((await f.db.query('select * from equipment order by id')).rows,before);
});
test('Sites Admin create/edit/retry/archive/restore preserves assignments and historical records',async t=>{
 const f=await fixture(t),operation=randomUUID(),patch={name:'Final QA project',location:'Isolated',assigned_engineer_id:f.actors.sky.id};
 const project=await save(f,f.actors.admin,null,null,patch,operation);
 assert.deepEqual(await save(f,f.actors.admin,null,null,patch,operation),project);
 const edited=await save(f,f.actors.admin,project.id,project.project_version,{location:'Updated'});
 await assert.rejects(save(f,f.actors.admin,project.id,project.project_version,{location:'Stale'}),e=>e.code==='40001');
 const archived=await save(f,f.actors.admin,project.id,edited.project_version,{is_active:false});assert.ok(archived.archived_at);
 const restored=await save(f,f.actors.admin,project.id,archived.project_version,{is_active:true});assert.equal(restored.archived_at,null);
 assert.equal(restored.assigned_engineer_id,f.actors.sky.id);
 const history=(await f.db.query('select * from project_history where project_id=$1',[project.id])).rows;assert.equal(history.length,4);
 assert.ok((await f.rpc(f.actors.sky,'mcpa_project_snapshot')).sites.some(s=>s.id===project.id));
 assert.ok(!(await f.rpc(f.actors.architect,'mcpa_project_snapshot')).sites.some(s=>s.id===project.id));
});
test('Sites invalid names, invalid progress and future Manila inventory dates fail atomically',async t=>{
 const f=await fixture(t),before=(await f.db.query('select * from sites order by id')).rows;
 for(const patch of [{name:' '},{progress:101},{last_inventory_check:'2999-01-01'},{status:'invalid'}])await assert.rejects(save(f,f.actors.admin,f.sites.casa,1,patch),e=>e.code==='23514');
 assert.deepEqual((await f.db.query('select * from sites order by id')).rows,before);
});
