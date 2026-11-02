// Offline artifact preparation only. Never serves, deploys or contacts a project.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const staging='blqlwfoserguserzmggo';
function policyFor(environment,projectRef){
 if(!['staging','production'].includes(environment)||!/^([a-z]{20})$/.test(projectRef||'')||environment==='staging'&&projectRef!==staging||environment==='production'&&projectRef===staging)throw Error('Specify a valid project for the explicit build environment.');
 return `Object.defineProperty(window,'MCPA_ENVIRONMENT_POLICY',{value:Object.freeze(${JSON.stringify({environment,projectRef})}),writable:false,configurable:false});\n`;
}
function prepare({environment,projectRef,publicKey,out,root=path.resolve(__dirname,'..')}){
 const policy=policyFor(environment,projectRef),origin='https://'+projectRef+'.supabase.co';
 const window={MCPA_SUPABASE_CONFIG:{url:origin,anonKey:publicKey}};
 vm.runInNewContext(policy,{window});vm.runInNewContext(fs.readFileSync(path.join(root,'js/environment.js'),'utf8'),{window,URL,atob});window.MCPAEnvironment.configuration();
 const target=path.resolve(out||'');const relative=path.relative(root,target);
 if(!out||!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.existsSync(target))throw Error('Output must be a new directory inside this checkout. Existing previews are never overwritten.');
 fs.mkdirSync(target,{recursive:true});
 for(const folder of ['1-admin','2-engr','css','images','js','modules','vendor'])if(fs.existsSync(path.join(root,folder)))fs.cpSync(path.join(root,folder),path.join(target,folder),{recursive:true,filter:source=>!['tests','node_modules'].includes(path.basename(source))});
 fs.copyFileSync(path.join(root,'index.html'),path.join(target,'index.html'));
 fs.writeFileSync(path.join(target,'js/environment-policy.js'),policy);
 fs.writeFileSync(path.join(target,'js/public-config.js'),'window.MCPA_SUPABASE_CONFIG='+JSON.stringify({url:origin,anonKey:publicKey})+';\n');
 let header;
 for(const entry of ['index.html','2-engr/index.html']){
  const filename=path.join(target,entry);if(!fs.existsSync(filename))continue;
  let html=fs.readFileSync(filename,'utf8').replaceAll(staging+'.supabase.co',projectRef+'.supabase.co');
  const prefix=entry==='index.html'?'':'../';html=html.replace(`<script src="${prefix}js/environment.js">`,`<script src="${prefix}js/public-config.js"></script>\n<script src="${prefix}js/environment.js">`);
  header=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];fs.writeFileSync(filename,html);
 }
 if(!header)throw Error('Missing artifact CSP.');
 fs.writeFileSync(path.join(target,'_headers'),'/*\n  Content-Security-Policy: '+header+"; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n");
 return {environment,projectRef,directory:target};
}
module.exports={policyFor,prepare};
if(require.main===module){try{const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,v,i,a)=>i%2?pairs:[...pairs,[v.replace(/^--/,''),a[i+1]]],[]));const result=prepare({environment:args.environment,projectRef:args['project-ref'],publicKey:process.env.MCPA_PUBLIC_SUPABASE_KEY,out:args.out});console.log('Prepared offline artifact: '+result.directory);}catch(error){console.error(error.message);process.exitCode=1;}}
