const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const origin='https://blqlwfoserguserzmggo.supabase.co',key='sb_publishable_OFFLINE_SYNTHETIC_00000000';
const client=(url,k)=>({supabaseUrl:url,supabaseKey:k,rest:{url:url+'/rest/v1'},auth:{url:url+'/auth/v1'},storage:{url:url+'/storage/v1'},functions:{url:url+'/functions/v1'},realtime:{endPoint:url.replace('https:','wss:')+'/realtime/v1'}});
function env(){let calls=0;const sdk={createClient(url,k){calls++;return client(url,k)},SupabaseClient(){throw Error('original constructor')}};Object.freeze(sdk);const window={supabase:sdk,MCPA_SUPABASE_CONFIG:{url:origin,anonKey:key}},context={window,URL,atob};for(const p of ['js/environment-policy.js','js/environment.js'])vm.runInNewContext(read(p),context);return {window,context,calls:()=>calls};}
test('M1 facade has null prototype, no original exports or prototype factory, frozen UMD compatible',()=>{
 const e=env();e.window.MCPAEnvironment.installSDK();assert.equal(Object.getPrototypeOf(e.window.supabase),null);assert.deepEqual(Object.getOwnPropertyNames(e.window.supabase).sort(),['SupabaseClient','createClient']);assert.equal(e.window.supabase.__proto__,undefined);assert.ok(Object.isFrozen(e.window.supabase));assert.equal(e.calls(),0);
 const c=new e.window.supabase.SupabaseClient(origin,key);assert.equal(e.window.MCPAEnvironment.verifyClient(c),c);assert.equal(e.calls(),1);
});
test('M1 facade refuses destination and transport bypass before constructing any client',()=>{
 const e=env();e.window.MCPAEnvironment.installSDK();for(const url of ['https://productionfixtureabc.supabase.co','https://wrong.example',origin+'/',origin+'@wrong.example'])for(const factory of [()=>e.window.supabase.createClient(url,key),()=>new e.window.supabase.SupabaseClient(url,key)])assert.throws(factory);
 assert.throws(()=>e.window.supabase.createClient(origin,key,{global:{fetch(){throw Error('never called')}}}));assert.equal(e.calls(),0);
});
test('M1 endpoint-shaped reused client is unverified; guarded client can be reused and endpoint mutation fails',()=>{
 const e=env();e.window.supabaseClient=client(origin,key);assert.throws(()=>e.window.MCPAEnvironment.client(),/Unverifiable/);assert.equal(e.calls(),0);delete e.window.supabaseClient;
 const c=e.window.MCPAEnvironment.client();assert.equal(e.window.MCPAEnvironment.client(),c);c.functions.url='https://wrong.example/functions/v1';assert.throws(()=>e.window.MCPAEnvironment.client());
});
test('M1 missing configuration prevents SDK invocation, application connection delegates to guard',()=>{
 const e=env();e.window.MCPA_SUPABASE_CONFIG=null;vm.runInNewContext(read('js/equipment-tracking.js'),e.context);assert.throws(()=>e.window.EquipmentTracking.client());assert.equal(e.calls(),0);
 e.window.MCPA_SUPABASE_CONFIG={url:origin,anonKey:key};assert.equal(e.window.EquipmentTracking.client().supabaseUrl,origin);
 for(const p of ['js/movement-cloud.js','1-admin/modules/sites/sites.js','1-admin/modules/consumables/consumables.js'])assert.match(read(p),/EquipmentTracking\.client/);
});
test('M2 all shared helpers require complete per-ID inspection evidence for acceptance',async()=>{
 const {receiptState}=await import('../../js/upgrades/transfer-review/transfer.mjs'),d=globalThis.MCPADisplay;
 const t={id:'T',status:'received',toolIds:['A','B'],inspections:['A','B'].map(toolId=>({toolId,condition:'good',tested:true,physicallyReceived:true}))};
 const cases=[[t,'Accepted'],[{...t,inspections:[]},'Receipt recorded'],[{...t,inspections:[null,null]},'Receipt recorded'],[{...t,inspections:[...t.inspections,null]},'Receipt recorded'],[{...t,inspections:[t.inspections[0]]},'Receipt recorded - Partial'],[{...t,inspections:[{toolId:'A',condition:'lost'}]},'Receipt recorded - Missing equipment'],[{...t,inspections:[{toolId:'A',condition:'damaged',disposition:'declined'}]},'Receipt recorded - Disputed'],[{...t,inspections:[{...t.inspections[0],physicallyReceived:false}]},'Receipt recorded - Partial'],[{...t,inspections:[t.inspections[0],t.inspections[0]]},'Receipt recorded'],[{...t,status:'rejected'},'Rejected'],[{...t,status:'refused'},'Damage Refused - Sender Follow-up'],[{...t,status:'canceled'},'Canceled']];
 for(const [record,label]of cases){const before=JSON.stringify(record);assert.equal(receiptState(record),label);assert.equal(d.status(record.status,'transfer',record),label);if(record.status==='received'){assert.ok(d.activity({action:'transfer_received',entityId:'T'},{transfers:[record]}).title.endsWith(label));assert.ok(d.notification({kind:'movement',data:{action:'receiveTransfer',entityId:'T'}},{transfers:[record]}).title.endsWith(label));}assert.equal(JSON.stringify(record),before);}
 assert.equal(d.status('received','transfer'),'Receipt recorded');assert.doesNotMatch(d.activity({action:'transfer_received'}).title,/Accepted/);
});
test('H1 inventory actions never embed Asset IDs in executable handlers; print labels are DOM text',()=>{
 const s=read('1-admin/modules/masterlist/masterlist.js');assert.doesNotMatch(s,/on(?:click|error|load)\s*=\s*["'][^\n]*\$\{item\.assetId\}/i);assert.match(s,/addEventListener\('click',\(\)=>showToolProfile\(item.assetId\)/);assert.doesNotMatch(s,/qrserver|eval\(|new Function/);assert.match(read('js/equipment-qr.js'),/label.textContent=assetId/);
});
test('M4 encoder has no network/dynamic execution and QR scripts retain strict independent CSP',()=>{
 const bundle=read('vendor/equipment-qr/encoder.js');assert.doesNotMatch(bundle,/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|new Function\s*\(/);
 for(const p of ['index.html','2-engr/index.html']){const s=read(p);assert.match(s,/vendor\/equipment-qr\/encoder.js/);assert.match(s,/img-src 'self' data: blob: https:\/\/blqlwfoserguserzmggo.supabase.co;/);assert.doesNotMatch(s,/img-src[^;]*\*|api.qrserver.com/);}
});
