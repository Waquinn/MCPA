// Offline regression entry point. No Supabase transport, deployment or migration CLI.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),mode=process.argv[2]||'--node';
if(!['--node','--browser'].includes(mode)){console.error('Use --node (default) or --browser.');process.exit(2);}
const files=[
 'tests/seven-finding-remediation/frontend.test.cjs','tests/seven-finding-remediation/database.test.cjs',
 'tests/audit-remediation/frontend.test.cjs','tests/audit-remediation/database.test.cjs',
 'tests/ui-transfer-review/database.test.cjs','tests/ui-transfer-review/isolation.test.cjs',
 'tests/legacy-handover-lockdown.test.cjs','tests/audit-remediation/blocked.test.cjs',
 'tests/display.test.cjs','tests/module-navigation.test.cjs','tests/movement-navigation.test.cjs',
 'tests/movement-store.test.cjs','tests/movement-sync.test.cjs','tests/inventory.test.cjs',
 'tests/project-construction.test.cjs','tests/project-history-dependency.test.cjs',
 'tests/qr-movement-v2/qr-transfer.test.cjs','tests/custody-lifecycle-v2/security.test.cjs',
 'tests/custody-lifecycle-v2/returns.test.cjs','tests/integration-quantity-custody-v2/client.test.cjs',
 'tests/engineer-upgrade/database.test.cjs','tests/engineer-upgrade/edge.test.mjs'
];
const evidenceRoot=path.join(root,'documentation/seven-finding-remediation-20261102');
fs.mkdirSync(evidenceRoot,{recursive:true});
const env={...process.env,NODE_PATH:[path.join(root,'tests/node_modules'),process.env.NODE_PATH].filter(Boolean).join(path.delimiter),MCPA_SKIP_SCREENSHOTS:'1'};
if(mode==='--browser'){
 const parent=path.join(root,'documentation/handoff-20261102/local-runs');fs.mkdirSync(parent,{recursive:true});
 env.MCPA_HANDOFF_ARTIFACT_DIR=fs.mkdtempSync(path.join(parent,'browser-'));
 console.log('Disposable browser results: '+path.relative(root,env.MCPA_HANDOFF_ARTIFACT_DIR));
}
const args=mode==='--browser'?['tests/auth.browser.cjs','--seven-finding-remediation']:['--test','--test-reporter=tap','--test-concurrency=1',...files];
const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
