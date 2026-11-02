const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const origin='https://blqlwfoserguserzmggo.supabase.co',key='sb_publishable_OFFLINE_SYNTHETIC_00000000';
const jwt=claims=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.offline-signature';
function client(url=origin,k=key){return {supabaseUrl:url,supabaseKey:k,rest:{url:url+'/rest/v1'},auth:{url:url+'/auth/v1'},storage:{url:url+'/storage/v1'},functions:{url:url+'/functions/v1'},realtime:{endPoint:url.replace('https:','wss:')+'/realtime/v1'}};}
function sandbox(config={url:origin,anonKey:key},existing){let created=0;const window={MCPA_SUPABASE_CONFIG:config,supabaseClient:existing,supabase:{createClient(url,k){created++;return client(url,k);},SupabaseClient:function(){throw Error('Must be guarded');}}};const context={window,URL,atob};for(const name of ['environment-policy.js','environment.js','equipment-tracking.js'])vm.runInNewContext(read('js/'+name),context);return {window,created:()=>created};}
test('H3 exact staging configuration creates a verified client once; legacy anon JWT accepted structurally',()=>{
 const s=sandbox();assert.equal(s.window.EquipmentTracking.client().supabaseUrl,origin);s.window.EquipmentTracking.client();assert.equal(s.created(),1);
 const token=jwt({role:'anon',ref:'blqlwfoserguserzmggo',exp:4102444800});assert.equal(sandbox({url:origin,anonKey:token}).window.EquipmentTracking.client().supabaseKey,token);
});
for(const [name,config]of [['missing',null],['missing key',{url:origin}],['malformed',{url:'invalid',anonKey:key}],['production',{url:'https://productionfixtureabc.supabase.co',anonKey:key}],['arbitrary',{url:'https://unapproved.example',anonKey:key}],['loopback',{url:'http://127.0.0.1:1',anonKey:key}],['suffix',{url:origin+'.evil.example',anonKey:key}],['path',{url:origin+'/',anonKey:key}],['privileged key',{url:origin,anonKey:'sb_secret_OFFLINE_ONLY'}],['service role JWT',{url:origin,anonKey:jwt({role:'service_role',ref:'blqlwfoserguserzmggo'})}],['wrong JWT project',{url:origin,anonKey:jwt({role:'anon',ref:'other'})}],['expired JWT',{url:origin,anonKey:jwt({role:'anon',ref:'blqlwfoserguserzmggo',exp:1})}]])test('H3 '+name+' configuration rejected before SDK construction',()=>{const s=sandbox(config);assert.throws(()=>s.window.EquipmentTracking.client());assert.equal(s.created(),0);});
test('H3 wrong-project, unverifiable and secondary-service clients rejected without use',()=>{
 for(const c of [{rpc(){throw Error('Network forbidden');}},client('https://wrong.example'),{...client(),storage:{url:'https://wrong.example/storage/v1'}},{...client(),realtime:{endPoint:'wss://wrong.example/realtime/v1'}}]){const s=sandbox(undefined,c);assert.throws(()=>s.window.EquipmentTracking.client());assert.equal(s.created(),0);}
 const s=sandbox(),c=s.window.EquipmentTracking.client();assert.equal(s.window.EquipmentTracking.client(),c);c.auth.url='https://wrong.example/auth/v1';assert.throws(()=>s.window.EquipmentTracking.client());
});
test('H3 SDK factory and exported constructor cannot bypass approved config or inject alternate transports',()=>{
 const s=sandbox();s.window.MCPAEnvironment.installSDK();
 assert.throws(()=>s.window.supabase.createClient('https://wrong.example',key));assert.throws(()=>new s.window.supabase.SupabaseClient('https://wrong.example',key));
 assert.throws(()=>s.window.supabase.createClient(origin,key,{global:{fetch(){throw Error('Network forbidden');}}}));assert.equal(s.created(),0);
 assert.throws(()=>Object.defineProperty(s.window.supabase,'createClient',{value(){}}));assert.throws(()=>Object.defineProperty(s.window,'MCPA_ENVIRONMENT_POLICY',{value:{environment:'production'}}));
 const immutable=sandbox();Object.freeze(immutable.window.supabase);immutable.window.MCPAEnvironment.installSDK();
 assert.equal(immutable.window.EquipmentTracking.client().supabaseUrl,origin);assert.equal(immutable.created(),1);
 assert.throws(()=>Object.defineProperty(immutable.window,'supabase',{value:{createClient(){}}}));
});
test('H3 offline adapter refuses real origins and is absent from application imports',()=>{
 assert.throws(()=>vm.runInNewContext(read('tests/audit-remediation/offline-environment.js'),{window:{},location:{protocol:'https:',hostname:'blqlwfoserguserzmggo.supabase.co',port:''}}));
 for(const html of ['index.html','2-engr/index.html']){const s=read(html);assert.doesNotMatch(s,/offline-environment|local-fixture/);assert.ok(s.indexOf('Content-Security-Policy')<s.indexOf('environment.js'));assert.match(s,/connect-src 'self' https:\/\/blqlwfoserguserzmggo.supabase.co wss:\/\/blqlwfoserguserzmggo.supabase.co;/);assert.match(s,/img-src 'self' data: blob: https:\/\/blqlwfoserguserzmggo.supabase.co;/);}
});
test('M1 Tool Handler Returns bypasses integration while Engineer and Admin keep their own routes',()=>{
 for(const [role,expected]of [['tool_handler',false],['engineer',true],['architect',true],['admin',true]]){
  const window={MCPAAuth:{profile:{role}}};vm.runInNewContext(read('js/integration.js'),{window,document:{currentScript:{src:'http://127.0.0.1/js/integration.js'}},URL});assert.equal(window.MCPAIntegration.handles('return'),expected);assert.equal(window.MCPAIntegration.handles('transfer'),true);
 }
});
test('M3 historical complete, incomplete, missing and disputed receipts keep accurate terminology',async()=>{
 const {receiptState}=await import('../../js/upgrades/transfer-review/transfer.mjs');const base={status:'received',toolIds:['A'],inspections:[{toolId:'A',condition:'good',tested:true,physicallyReceived:true}]};
 assert.equal(receiptState(base),'Accepted');assert.equal(receiptState({...base,inspections:[]}), 'Receipt recorded');
 for(const row of [{condition:'lost'},{condition:'damaged',disposition:'declined'},{condition:'disputed'},{condition:'good',physicallyReceived:false}])assert.match(receiptState({...base,inspections:[{...base.inspections[0],...row}]}),/Receipt recorded -/);
 assert.equal(receiptState({...base,inspections:[{toolId:'A',condition:'good',tested:true}]}),'Receipt recorded');assert.equal(receiptState({status:'refused'}),'Damage Refused - Sender Follow-up');assert.equal(receiptState({status:'rejected'}),'Rejected');
});
test('M5 duplicate name and role labels include permitted projects and distinct UUIDs without email',async()=>{
 const {recipientLabel}=await import('../../js/upgrades/transfer-review/transfer.mjs');const a={id:'one',name:'Same Name',role:'engineer'},b={...a,id:'two'};const data={recipients:[a,b],sites:[{name:'Project A',assignedEngineerId:'one'},{name:'Project B',assignedEngineerId:'two'}]};
 assert.match(recipientLabel(a,data),/Project A.*Profile one/);assert.match(recipientLabel(b,data),/Project B.*Profile two/);assert.notEqual(recipientLabel(a,data),recipientLabel(b,data));
 assert.ok(recipientLabel(a,data).includes(String.fromCharCode(183)));assert.doesNotMatch(recipientLabel(a,data),/\\u[0-9a-f]{4}/i);
});
test('H3 separate production artifact policy requires explicit project and never accepts it in staging source',()=>{
 const {policyFor}=require('../../scripts/prepare-frontend-artifact.cjs');
 assert.throws(()=>policyFor('staging','abcdefghijklmnopqrst'));assert.throws(()=>policyFor('production','blqlwfoserguserzmggo'));
 const window={MCPA_SUPABASE_CONFIG:{url:'https://abcdefghijklmnopqrst.supabase.co',anonKey:key}};
 vm.runInNewContext(policyFor('production','abcdefghijklmnopqrst'),{window});vm.runInNewContext(read('js/environment.js'),{window,URL,atob});
 assert.equal(window.MCPAEnvironment.configuration().url,'https://abcdefghijklmnopqrst.supabase.co');
 const staging=sandbox(window.MCPA_SUPABASE_CONFIG);assert.throws(()=>staging.window.EquipmentTracking.client());
});
test('H3 offline artifact preparation emits environment-specific policy, public configuration and response headers without overwriting source',()=>{
 const {prepare}=require('../../scripts/prepare-frontend-artifact.cjs');
 const fixture=fs.mkdtempSync(path.join(root,'documentation/seven-finding-remediation-20261102/build-fixture-'));fs.mkdirSync(path.join(fixture,'js'));fs.mkdirSync(path.join(fixture,'2-engr'));
 for(const name of ['environment.js','environment-policy.js'])fs.copyFileSync(path.join(root,'js',name),path.join(fixture,'js',name));
 for(const name of ['index.html','2-engr/index.html'])fs.copyFileSync(path.join(root,name),path.join(fixture,name));
 const original=fs.readFileSync(path.join(fixture,'index.html'),'utf8');
 for(const [environment,projectRef]of [['staging','blqlwfoserguserzmggo'],['production','abcdefghijklmnopqrst']]){
  const out=path.join(fixture,'artifact-'+environment);prepare({environment,projectRef,publicKey:key,out,root:fixture});
  const headers=fs.readFileSync(path.join(out,'_headers'),'utf8');assert.ok(headers.includes('https://'+projectRef+'.supabase.co'));assert.ok(headers.includes("frame-ancestors 'none'"));
  assert.ok(fs.readFileSync(path.join(out,'index.html'),'utf8').includes('js/public-config.js'));assert.ok(fs.readFileSync(path.join(out,'2-engr/index.html'),'utf8').includes('../js/public-config.js'));
  if(environment==='production')assert.ok(!headers.includes('blqlwfoserguserzmggo'));
  assert.throws(()=>prepare({environment,projectRef,publicKey:key,out,root:fixture}),/new directory/);
 }
 assert.equal(fs.readFileSync(path.join(fixture,'index.html'),'utf8'),original);
});
