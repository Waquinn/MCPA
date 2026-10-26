const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const tests=path.resolve(__dirname,'..'),out=path.resolve(tests,'../documentation/engineer-upgrade');
fs.mkdirSync(out,{recursive:true});
const suites=[
 ['regression-tests.log',['--test','--test-concurrency=1','engineer-upgrade/database.test.cjs','engineer-upgrade/edge.test.mjs','accounts-edge.test.mjs','accounts-database.test.cjs','development-accounts.test.mjs','auth-database.test.cjs','inventory.test.cjs','movement-sync.test.cjs','module-navigation.test.cjs','quantity-requests-v2/frontend.test.cjs','integration-quantity-custody-v2/client.test.cjs','integration-quantity-custody-v2/database.test.cjs','integration-quantity-custody-v2/final-races.test.cjs']],
 ['engineer-browser.log',['auth.browser.cjs','--engineer-upgrade']],
 ['combined-browser.log',['auth.browser.cjs','--combined-integration']],
 ['unified-browser.log',['auth.browser.cjs','--unified-requests']]
];
let failed=false;
for(const [name,args]of suites){
 const r=spawnSync(process.execPath,args,{cwd:tests,env:process.env,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
 fs.writeFileSync(path.join(out,name),(r.stdout||'')+(r.stderr||'')+(r.error?'\n'+r.error.message:'')+'\nEXIT_CODE='+r.status+'\n');
 console.log(name+': '+(r.status===0?'PASS':'FAIL')+'\n'+(r.stdout||'').split(/\r?\n/).filter(l=>/^(ℹ|PASS |Browser artifacts:)/.test(l)).join('\n'));
 if(r.status!==0)failed=true;
}
process.exitCode=failed?1:0;
