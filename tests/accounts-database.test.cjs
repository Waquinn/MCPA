const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');

test('invitations preserve identities, restrict privileges, reconcile retries and audit changes',async()=>{
 const f=await authDatabase(),{db,actors:a,query,rpc}=f;
 const step=async(actor,action,payload)=>{await db.exec('set role service_role');try{return (await db.query('select mcpa_invitation_step($1,$2,$3) value',[actor.authId,action,payload])).rows[0].value;}finally{await db.exec('reset role');}};
 try{
  const existing=randomUUID();await db.query('insert into profiles(id,name) values($1,$2)',[existing,'Historical Engineer']);
  const input={id:randomUUID(),profile_id:existing,name:'Historical Engineer',email:'history@example.test',role:'engineer'};
  await assert.rejects(()=>query(a.admin,'select mcpa_invitation_step($1,$2,$3)',[a.admin.authId,'prepare',input]),/permission denied/);
  await assert.rejects(()=>step(a.sky,'prepare',input),/Active Admin/);
  await assert.rejects(()=>step(a.admin,'prepare',{...input,role:'admin'}),/supported role/);
  const job=await step(a.admin,'prepare',input);assert.equal(job.profile_id,existing);
  assert.equal((await step(a.admin,'prepare',{...input,id:randomUUID()})).id,job.id,'Same email reuses durable job');
  await assert.rejects(()=>step(a.admin,'prepare',{...input,name:'Another person'}),/different details/);
  const claim=await step(a.admin,'claim',{id:job.id});
  await assert.rejects(()=>step(a.admin,'claim',{id:job.id}),/already being sent/);
  const authId=randomUUID();
  await db.query("insert into auth.users(id,email,invited_at,raw_user_meta_data) values($1,$2,now(),$3)",[authId,input.email,{mcpa_invitation_id:job.id}]);
  await step(a.admin,'release',{id:job.id,lease_id:claim.lease_id});
  const retry=await step(a.admin,'claim',{id:job.id});assert.equal(retry.auth_user_id,authId);
  await step(a.admin,'finish',{id:job.id,lease_id:retry.lease_id,auth_user_id:authId});
  const profile=(await db.query('select * from profiles where id=$1',[existing])).rows[0];assert.equal(profile.auth_user_id,authId);assert.notEqual(profile.id,authId);assert.equal(profile.account_status,'active');
  let account=(await rpc(a.admin,'mcpa_accounts')).find(p=>p.id===existing);assert.equal(account.invitation_pending,true);assert.equal(account.email,input.email);
  await assert.rejects(()=>step(a.admin,'claim',{id:job.id}),/Wait one minute/);
  await db.query("update mcpa_account_invitations set sent_at=now()-interval '2 minutes' where id=$1",[job.id]);
  const resend=await step(a.admin,'claim',{id:job.id});
  await step(a.admin,'finish',{id:job.id,lease_id:resend.lease_id,auth_user_id:authId});
  await assert.rejects(()=>step(a.admin,'finish',{id:job.id,lease_id:resend.lease_id,auth_user_id:authId}),/attempt changed/);
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[authId]);
  account=(await rpc(a.admin,'mcpa_accounts')).find(p=>p.id===existing);assert.equal(account.invitation_pending,false);
  const args={p_id:existing,p_name:input.name,p_role:'architect',p_status:'inactive',p_auth_user_id:authId};
  await rpc(a.admin,'mcpa_save_account',args);
  await assert.rejects(()=>rpc(a.admin,'mcpa_save_account',{...args,p_auth_user_id:a.sky.authId}),/cannot be reassigned/);
  await assert.rejects(()=>rpc(a.admin,'mcpa_save_account',{...args,p_role:'admin'}),/separately authorized/);
  await rpc(a.admin,'mcpa_save_account',{...args,p_status:'active'});
  const events=(await query(a.admin,'select * from mcpa_account_audit where profile_id=$1',[existing])).rows;
  for(const event of ['user_invited','invitation_resent','account_linked','role_changed','account_deactivated','account_reactivated'])assert.ok(events.some(row=>row.event===event&&row.actor_id===a.admin.id&&row.created_at));
  assert.equal((await query(a.sky,'select * from mcpa_account_audit')).rows.length,0);
  await assert.rejects(()=>query(a.admin,"insert into mcpa_account_audit(actor_id,profile_id,event) values($1,$2,'forged')",[a.admin.id,existing]),/permission denied/);
  await assert.rejects(()=>step(a.admin,'prepare',{id:randomUUID(),name:a.sky.name,email:'duplicate@example.test',role:'engineer'}),/person with this name exists/);
  const distinct=await step(a.admin,'prepare',{id:randomUUID(),name:a.sky.name,email:'duplicate@example.test',role:'engineer',distinct_person:true});assert.notEqual(distinct.profile_id,a.sky.id);
  await assert.rejects(()=>step(a.admin,'prepare',{id:randomUUID(),name:'Existing email',email:'sky@example.test',role:'engineer'}),/already has an Auth/);
  assert.equal((await db.query('select auth_user_id from profiles where id=$1',[a.admin.id])).rows[0].auth_user_id,a.admin.authId);
 }finally{await f.close();}
});

test('duplicate-name recipients use UUIDs and preserve all receipt safeguards',async()=>{
 const f=await authDatabase(),{db,actors:a,rpc}=f;
 try{
  await db.query('update profiles set name=$1 where id=$2',[a.sky.name,a.pau.id]);
  const act=(actor,action,payload)=>rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
  await assert.rejects(()=>act(a.sky,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiver:a.sky.name}),/active Engineer/);
  await assert.rejects(()=>act(a.sky,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiverId:a.inactive.id}),/active Engineer/);
  const transfer=await act(a.sky,'createTransfer',{toolIds:['TOOL-002'],destination:'Main Warehouse',receiverId:a.pau.id,receiver:'Forged name'});
  assert.equal(transfer.receiverId,a.pau.id);assert.equal(transfer.receiver,a.sky.name);
  const inspections=[{toolId:'TOOL-002',condition:'good',tested:true}];
  await assert.rejects(()=>act(a.sky,'receiveTransfer',{id:transfer.id,inspections}),/named receiver/);
  await db.query("update profiles set account_status='inactive' where id=$1",[a.pau.id]);
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections}),/active authorized/);
  await db.query("update profiles set account_status='active',name='Renamed Receiver' where id=$1",[a.pau.id]);
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections:[]}),/exactly one/);
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-002',condition:'good'}]}),/Test every/);
  await db.query("update equipment set quantity=2 where asset_id='TOOL-002'");
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections}),/custody or status changed/);
  await db.query("update equipment set quantity=1 where asset_id='TOOL-002'");
  assert.equal((await db.query("select current_holder_id from equipment where asset_id='TOOL-002'")).rows[0].current_holder_id,a.sky.id);
  await act(a.pau,'receiveTransfer',{id:transfer.id,inspections});
  await assert.rejects(()=>act(a.pau,'receiveTransfer',{id:transfer.id,inspections}),/Only pending/);
  const snapshot=await rpc(a.admin,'mcpa_movement_snapshot');assert.equal(snapshot.tools.find(t=>t.id==='TOOL-002').holderId,a.pau.id);assert.ok(snapshot.activity.some(row=>row.entityId===transfer.id));
  assert.ok(snapshot.users.find(p=>p.id===a.sky.id).projects.includes('Casa Buena'));
  const before=(await db.query('select count(*)::int n from mcpa_movements')).rows[0].n;
  const fs=require('fs'),path=require('path');
  for(const file of ['202610060001_account_management.sql','202610060002_recipient_identity.sql']){
   const results=await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
   if(file==='202610060002_recipient_identity.sql'){
    const report=results.at(-1).rows[0].recipient_identity_verification;
    assert.equal(report.receiver_lookup_uses_profile_id,true);
    assert.equal(report.legacy_receiver_name_lookup_present,false);
    assert.equal(report.receipt_matches_authenticated_profile,true);
    assert.equal(report.recipient_project_context_present,true);
    for(const permission of report.rpc_permissions){
     assert.equal(permission.anon_execute,false);
     assert.equal(permission.authenticated_execute,permission.function.startsWith('public.'));
    }
   }
  }
  assert.equal((await db.query('select count(*)::int n from mcpa_movements')).rows[0].n,before);
 }finally{await f.close();}
});
