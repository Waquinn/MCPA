import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createHandler} from '../supabase/functions/manage-accounts/handler.mjs';
const {authDatabase}=createRequire(import.meta.url)('./auth-test-db.cjs');
function fixture({role='admin',status='active',invalidToken=false,mailError=false,finishError=false,confirmed=false}={}){
 const calls=[],id=randomUUID(),userId=randomUUID(),profileId=randomUUID();
 const job={id,email:'engineer@example.test',name:'Engineer',role:'engineer',profile_id:profileId,state:'prepared',lease_id:randomUUID(),confirmed,auth_user_id:confirmed?userId:null};
 const admin={auth:{getUser:async token=>{calls.push(['getUser',token]);return invalidToken?{error:{}}:{data:{user:{id:userId}}};},admin:{inviteUserByEmail:async(email,options)=>{calls.push(['invite',email,options]);return mailError?{error:{status:429}}:{data:{user:{id:userId}}};}}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:profileId,role,account_status:status}})})})}),rpc:async(name,args)=>{calls.push([name,args]);return finishError&&args.p_action==='finish'?{error:{code:'42501',message:'Active Admin access required.'}}:{data:job};}};
 const handler=createHandler({admin,appUrl:'https://mcpa.example/index.html'});
 const request=(body,headers={authorization:'Bearer valid'},method='POST')=>handler(new Request('https://edge.example',{method,headers,body:method==='POST'?JSON.stringify(body):undefined}));
 return {request,calls,job,input:{action:'invite',id,name:'Engineer',email:job.email,role:'engineer'}};
}
test('Edge endpoint requires verified active Admin before invoking privileged operations',async()=>{
 for(const config of [{invalidToken:true},{role:'engineer'},{status:'inactive'}]){const f=fixture(config);const response=await f.request(f.input);assert.ok([401,403].includes(response.status));assert.equal(f.calls.some(c=>c[0]==='invite'||c[0]==='mcpa_invitation_step'),false);}
 const f=fixture();assert.equal((await f.request(f.input,{})).status,401);assert.equal((await f.request(f.input,{authorization:'Bearer valid',origin:'https://evil.example'})).status,403);
 for(const change of [{role:'admin'},{role:'owner'},{email:'bad'},{profile_id:'not-uuid'},{distinct_person:'true'},{id:'bad'}])assert.equal((await f.request({...f.input,...change})).status,400);
 assert.equal(f.calls.some(c=>c[0]==='invite'),false);
});
test('invitation sends only server-configured redirect and finishes the durable job',async()=>{
 const f=fixture();const response=await f.request({...f.input,redirectTo:'https://evil.example',p_actor:'forged'});assert.equal(response.status,200);
 const invite=f.calls.find(c=>c[0]==='invite');assert.equal(invite[2].redirectTo,'https://mcpa.example/index.html?account_setup=invite');assert.equal(invite[2].data.mcpa_invitation_id,f.job.id);
 assert.deepEqual(f.calls.filter(c=>c[0]==='mcpa_invitation_step').map(c=>c[1].p_action),['prepare','claim','finish']);
 const body=await response.json();assert.equal(body.profile_id,f.job.profile_id);assert.equal(JSON.stringify(body).includes('lease'),false);
});
test('mail/link failures release the lease; confirmed retry reconciles without another email',async()=>{
 for(const config of [{mailError:true},{finishError:true}]){const f=fixture(config);assert.ok((await f.request(f.input)).status>=400);assert.equal(f.calls.at(-1)[1].p_action,'release');}
 const f=fixture({confirmed:true});assert.equal((await f.request({action:'retry',id:f.job.id})).status,200);assert.equal(f.calls.some(c=>c[0]==='invite'),false);
});

test('handler and PostgreSQL reconcile an accepted invitation after interrupted profile linking',async()=>{
 const f=await authDatabase(),{db,actors}=f;
 let failFinish=true,emails=0;
 const admin={auth:{getUser:async()=>({data:{user:{id:actors.admin.authId}}}),admin:{inviteUserByEmail:async(email,options)=>{
   emails++;const id=randomUUID();await db.query('insert into auth.users(id,email,invited_at,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),now(),$3)',[id,email,options.data]);return {data:{user:{id}}};
 }}},from:()=>({select:()=>({eq:(_,id)=>({maybeSingle:async()=>({data:(await db.query('select id,role,account_status from profiles where auth_user_id=$1',[id])).rows[0]})})})}),rpc:async(_,args)=>{
   if(args.p_action==='finish'&&failFinish){failFinish=false;return {error:{code:'TEST'}};}
   try{return {data:(await db.query('select mcpa_invitation_step($1,$2,$3) value',[args.p_actor,args.p_action,args.p_payload])).rows[0].value};}catch(error){return {error};}
 }};
 try{
  const personId=randomUUID();await db.query('insert into profiles(id,name) values($1,$2)',[personId,'Existing Historical Person']);
  const body={action:'invite',id:randomUUID(),profile_id:personId,name:'Existing Historical Person',email:'historical@example.test',role:'engineer'};
  const handle=createHandler({admin,appUrl:'https://mcpa.example/index.html'});
  const send=()=>handle(new Request('https://edge.example',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify(body)}));
  assert.equal((await send()).status,503);
  assert.equal((await db.query('select auth_user_id from profiles where id=$1',[personId])).rows[0].auth_user_id,null);
  assert.equal((await send()).status,200);assert.equal(emails,1,'Already accepted invitation is reconciled without resending');
  assert.equal((await send()).status,200);assert.equal(emails,1,'Completed retries are idempotent');
  const rows=(await db.query('select id,auth_user_id from profiles where name=$1',[body.name])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].id,personId);assert.ok(rows[0].auth_user_id);assert.notEqual(rows[0].id,rows[0].auth_user_id);
 }finally{await f.close();}
});
