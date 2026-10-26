import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHandler} from '../../supabase/functions/manage-accounts/handler.mjs';
import {readConfiguration} from '../../supabase/functions/manage-accounts/runtime.mjs';
function fixture({role='admin',status='active',denied=false,passwordError=false}={}){
 const calls=[],user=randomUUID(),job={id:randomUUID(),profile_id:randomUUID(),email:'invited@example.test',name:'Invited Person',role:'engineer',lease_id:randomUUID()};
 const admin={auth:{getUser:async token=>token==='valid'?{data:{user:{id:user}}}:{error:{}},admin:{
  generateLink:async values=>{calls.push(['generateLink',values]);return {data:{user:{id:user},properties:{action_link:'https://auth.example/verify?token=fixture'}}};},
  updateUserById:async(id,values)=>{calls.push(['passwordUser',id,Object.keys(values)]);return passwordError?{error:{}}:{error:null};}
 }},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:job.profile_id,role,account_status:status}})})})}),rpc:async(name,args)=>{calls.push([name,args]);return denied&&name==='mcpa_complete_invitation'?{error:{code:'42501',message:'Invitation expired or revoked.'}}:{data:job};}};
 const handle=createHandler({admin,appUrl:'https://app.example/MCPA/index.html',invitationLinksEnabled:true});
 const request=(body,token='valid',origin='https://app.example')=>handle(new Request('https://edge.example',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin},body:JSON.stringify(body)}));
 return {calls,request,job,user};
}
test('private links require active Admin; the server fixes redirect, role set and cache policy',async()=>{
 for(const options of [{role:'engineer'},{status:'inactive'}]){
  const f=fixture(options);assert.equal((await f.request({action:'invite',id:f.job.id,name:'Name',email:f.job.email,role:'engineer',delivery:'link'})).status,403);assert.equal(f.calls.length,0);
 }
 const f=fixture(),r=await f.request({action:'invite',id:f.job.id,name:'Name',email:f.job.email,role:'engineer',delivery:'link',redirectTo:'https://evil.example'});
 assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.ok((await r.json()).invitation_link);
 const gen=f.calls.find(c=>c[0]==='generateLink')[1];assert.equal(gen.options.redirectTo,'https://app.example/MCPA/index.html?account_setup=invite');assert.equal(gen.type,'invite');
 assert.equal((await f.request({action:'invite',id:f.job.id,name:'Name',email:f.job.email,role:'admin',delivery:'link'})).status,400);
 assert.equal((await f.request({action:'capabilities'},'invalid')).status,401);
 assert.equal((await f.request({action:'capabilities'},'valid','https://evil.example')).status,403);
});
test('recipient acceptance uses verified bearer identity and ignores submitted role/email/UUID',async()=>{
 const f=fixture({role:'engineer',status:'inactive'});
 const response=await f.request({action:'accept',name:'Invited Name',password:'Local-test-password-123',role:'admin',email:'other@example.test',p_user:randomUUID()});
 assert.equal(response.status,200);
 const rpc=f.calls.filter(c=>c[0]==='mcpa_complete_invitation');assert.deepEqual(rpc.map(c=>c[1].p_finish),[false,true]);
 assert.ok(rpc.every(c=>c[1].p_user===f.user));assert.ok(rpc.every(c=>!('role'in c[1])&&!('email'in c[1])&&!('password'in c[1])));
 assert.deepEqual(f.calls.find(c=>c[0]==='passwordUser'),['passwordUser',f.user,['password']]);
});
test('expired/revoked invitations and invalid passwords cannot activate accounts',async()=>{
 const f=fixture({denied:true,role:'engineer',status:'inactive'});
 assert.equal((await f.request({action:'accept',name:'Name',password:'Local-test-password-123'})).status,403);assert.equal(f.calls.some(c=>c[0]==='passwordUser'),false);
 const invalid=fixture({role:'engineer',status:'inactive'});assert.equal((await invalid.request({action:'accept',name:'Name',password:'short'})).status,400);assert.equal(invalid.calls.some(c=>c[1]?.p_finish===true),false);
 const failure=fixture({role:'engineer',status:'inactive',passwordError:true});assert.equal((await failure.request({action:'accept',name:'Name',password:'Local-test-password-123'})).status,400);assert.equal(failure.calls.some(c=>c[1]?.p_finish===true),false);
});
test('runtime uses injected server keys and fails closed outside the configured app',()=>{
 const config=readConfiguration(k=>({SUPABASE_URL:'https://stage.supabase.co',SUPABASE_SECRET_KEYS:'{"default":"synthetic-server-secret"}',MCPA_APP_URL:'https://stage.example/index.html'})[k]);
 assert.equal(config.serverKey,'synthetic-server-secret');assert.equal(config.developmentEnabled,false);
 assert.throws(()=>readConfiguration(k=>({SUPABASE_URL:'https://stage.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic'})[k]),/MCPA_APP_URL/);
});
