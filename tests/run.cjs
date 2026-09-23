// Run isolated suites sequentially so browser instances do not compete for resources.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const suites={
  database:['modules/sites/tests/sites.database.cjs','modules/consumables/tests/consumables.database.cjs','modules/requests/tests/movement.database.cjs','tests/settings.database.cjs'],
  browser:['modules/masterlist/tests/masterlist.browser.cjs','modules/sites/tests/sites.browser.cjs','modules/consumables/tests/consumables.browser.cjs','modules/requests/tests/movement.browser.cjs','tests/records.browser.cjs','tests/system.browser.cjs']
};
const group=process.argv[2];
if(group&&!suites[group])throw new Error('Expected database or browser');
for(const file of group?suites[group]:Object.values(suites).flat()){
  console.log('\nRunning '+file);
  const result=spawnSync(process.execPath,[file],{cwd:path.resolve(__dirname,'..'),stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log('\nAll requested suites passed. No live database writes.');
