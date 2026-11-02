const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..');
test('missing environment configuration cannot create a client or trust a pre-existing client',()=>{
 let created=0;const window={supabaseClient:{rpc(){throw Error('Network forbidden');}},supabase:{createClient(){created++;throw Error('Network forbidden');}}};
 for(const name of ['environment-policy.js','environment.js','equipment-tracking.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'js',name),'utf8'),{window,URL,atob});
 assert.throws(()=>window.EquipmentTracking.client(),/not configured/);assert.equal(created,0);
});
test('runtime code has no embedded credentials or unapproved Supabase endpoint fallback',()=>{
 const visit=folder=>{for(const item of fs.readdirSync(folder,{withFileTypes:true})){const name=path.join(folder,item.name);if(item.isDirectory()&&!['node_modules','tests'].includes(item.name))visit(name);else if(item.isFile()&&/\.(?:js|mjs|html)$/.test(name)){const source=fs.readFileSync(name,'utf8');assert.doesNotMatch(source,/sb_publishable_[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.eyJ/,'Embedded key in '+name);for(const match of source.matchAll(/https:\/\/[a-z0-9]+\.supabase\.co/g))assert.equal(match[0],'https://blqlwfoserguserzmggo.supabase.co','Unexpected endpoint '+name);}}};
 for(const name of ['js','1-admin','2-engr'])visit(path.join(root,name));
});
