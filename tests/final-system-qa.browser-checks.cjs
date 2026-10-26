// Read-only route/layout coverage on current local RPCs/RLS. No hosted services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
exports.verify=async({fixture:f,evaluate,command,wait,click,go,login,logout,base,shot})=>{
 const out=process.env.MCPA_QA_ARTIFACT_ROOT||path.join(__dirname,'artifacts/final-system-qa');fs.mkdirSync(out,{recursive:true});
 const rows=[],screenshots=new Set();
 const persist=()=>fs.writeFileSync(path.join(out,'route-matrix.json'),JSON.stringify(rows,null,2));
 const check=async(role,module,scenario,run)=>{try{const actual=await run();rows.push({role,module,scenario,status:'PASS',actual});}catch(error){rows.push({role,module,scenario,status:'FAIL',actual:error.message});}persist();};
 const actors=[['admin','admin'],['sky','engineer'],['architect','architect'],['secretary','secretary'],['handler','tool_handler']];
 const allRoutes=['dashboard','masterlist','sites','request','transfer','return','repair','missing','consumables','purchase','reports','activity','users','settings','quantity-request','outward-materials','asset-transfer','transfer-inbox','asset-retirement-v2','retired-equipment-v2'];
 await command('Page.navigate',{url:base+'/MCPA/index.html'});
 await check('engineer','auth','Incorrect password is rejected',async()=>{await login('sky','wrong');await wait('document.querySelector("#auth-feedback").textContent.includes("Incorrect")');assert.equal(await evaluate('MCPAAuth.profile'),null);return 'No authenticated profile';});
 await check('inactive','auth','Inactive account cannot enter workspace',async()=>{await login('inactive');await wait('document.querySelector("#auth-feedback").textContent.includes("inactive")');assert.equal(await evaluate('MCPAAuth.profile'),null);await logout();return 'Inactive profile denied';});
 await check('unlinked','auth','Unlinked Auth identity cannot enter workspace',async()=>{await login('missing');await wait('document.querySelector("#auth-feedback").textContent.includes("not assigned")');assert.equal(await evaluate('MCPAAuth.profile'),null);await logout();return 'Unlinked identity denied';});
 for(const [key,role]of actors){
  await command('Page.navigate',{url:base+'/MCPA/index.html'});await login(key);await wait('MCPAAuth.profile?.role==='+JSON.stringify(role));
  await check(role,'auth','Authenticated session survives reload',async()=>{await command('Page.reload');await wait('window.MCPAAuth?.profile?.role==='+JSON.stringify(role));return 'Active role retained';});
  await check(role,'auth','Unchanged profile verification retains menu focus',async()=>{assert.equal(await evaluate('(async()=>{const summary=document.querySelector("#account-menu summary");summary.focus();await MCPAAuth.verify();return summary.isConnected&&document.activeElement===summary;})()'),true);return 'Existing account control and focus retained';});
  const routes=await evaluate('[...document.querySelectorAll("#nav-list [data-target]")].map(n=>n.dataset.target)');
  await check(role,'permissions','Every visible navigation entry is permitted',async()=>{assert.ok(routes.length);assert.ok(await evaluate('[...document.querySelectorAll("#nav-list [data-target]")].every(n=>MCPAAuth.canRoute(n.dataset.target))'));return routes;});
  for(const route of routes){
   for(const width of [1440,390])for(const dark of [false,true]){
    await check(role,route,`${width}px ${dark?'dark':'light'} route and layout`,async()=>{
     await command('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
     await evaluate(`document.body.classList.toggle('dark',${dark})`);await go(route);
     await wait('document.querySelector("#content").getAttribute("aria-busy")!=="true"');
     await wait('![...document.querySelectorAll("#content [aria-busy]")].some(n=>n.getAttribute("aria-busy")==="true")');
     const result=await evaluate(`(()=>{const screen=document.querySelector('#screen-${route}.active');return {heading:screen?.querySelector('h1,h2,h3')?.textContent.trim(),text:screen?.innerText.slice(0,220),overflow:document.documentElement.scrollWidth-innerWidth,alerts:[...screen?.querySelectorAll('[role=alert],.error')||[]].map(n=>n.textContent.trim()).filter(Boolean),theme:document.body.classList.contains('dark')};})()`);
     assert.ok(result.heading||result.text,JSON.stringify(result));assert.ok(result.overflow<=1,JSON.stringify(result));
     assert.deepEqual(result.alerts,[],JSON.stringify(result));
     assert.equal(result.theme,dark);
     if(width===390&&dark&&!screenshots.has(route)){screenshots.add(route);await shot('qa-'+role+'-'+route+'-mobile-dark',true);}
     if(width===1440&&!dark&&['dashboard','request','consumables','outward-materials'].includes(route))await shot('qa-'+role+'-'+route+'-desktop',true);
     return result;
    });
   }
  }
  for(const route of allRoutes.filter(r=>!routes.includes(r))){
   if(await evaluate('MCPAAuth.canRoute('+JSON.stringify(route)+')'))continue; // Hidden detail/compatibility routes remain intentionally accessible.
   await check(role,'permissions','Direct route denies '+route,async()=>{await evaluate('showScreen('+JSON.stringify(route)+')');await wait('document.querySelector("#content [role=alert]")?.textContent.includes("Access restricted")');return 'Denied by route guard';});
  }
  await check(role,'auth','Logout removes protected content',async()=>{await logout();assert.equal(await evaluate('document.querySelector("#content").children.length'),0);return 'Signed out and protected DOM cleared';});
 }
 await login('sky');await wait('MCPAAuth.profile?.role==="engineer"');
 await check('engineer','auth','Session expiration removes protected content',async()=>{await evaluate('__expire()');await wait('document.querySelector("#auth-email")');assert.equal(await evaluate('document.querySelector("#content").children.length'),0);return 'Expired session cleared';});
 const failures=rows.filter(r=>r.status==='FAIL');console.log(JSON.stringify({checks:rows.length,passed:rows.length-failures.length,failed:failures.length,failures}));assert.equal(failures.length,0,'Current role/route matrix must pass; see route-matrix.json');
};
