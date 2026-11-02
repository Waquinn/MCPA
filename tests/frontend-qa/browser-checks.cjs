// Supplemental checks run only through the existing loopback-only browser harness.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
exports.verify=async({evaluate,command,wait,click,fill,submit,go,login,logout,base,networkAudit})=>{
 const parent=path.join(__dirname,'../../documentation/frontend-qa-20261103/local-runs');
 fs.mkdirSync(parent,{recursive:true});const output=fs.mkdtempSync(path.join(parent,'browser-'));
 const results=[];
 const check=async(name,fn)=>{try{await fn();results.push({name,result:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,result:'FAIL',evidence:error.message});console.log('FAIL '+name+': '+error.message);}};
 const size=(width,height=900)=>command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=900});
 const key=async(key,code=key,extra={})=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,...extra});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,...extra});};
 const capture=async name=>{if(process.env.MCPA_SKIP_SCREENSHOTS==='1')return;await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(data,'base64'));};
 await command('Page.navigate',{url:base+'/index.html'});await login('admin');await wait('MCPAAuth.profile?.role==="admin"');await go('dashboard');
 await check('Admin keyboard accordion has one expanded group and a visible focus indicator',async()=>{
  await evaluate('document.querySelector("[data-nav-group=equipment]").focus()');await key('Enter','Enter',{windowsVirtualKeyCode:13,text:'\r'});
  assert.equal(await evaluate('document.querySelector("[data-nav-group=equipment]").getAttribute("aria-expanded")'),'true');
  assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'solid');
  await click('[data-nav-group=movements]');assert.equal(await evaluate('document.querySelectorAll("[data-nav-group][aria-expanded=true]").length'),1);
  await click('[data-nav-group=movements]');assert.equal(await evaluate('document.querySelectorAll("[data-nav-group][aria-expanded=true]").length'),0);
 });
 await check('Mobile drawer traps Tab, closes with Escape, and restores its trigger',async()=>{
  await size(390,844);await wait('document.querySelector("#sidebar").inert');await click('.mobile-menu-btn');
  await wait('document.querySelector("#sidebar").classList.contains("open")');await key('Tab','Tab',{windowsVirtualKeyCode:9,modifiers:8});
  assert.ok(await evaluate('document.querySelector("#sidebar").contains(document.activeElement)'));
  await key('Escape','Escape',{windowsVirtualKeyCode:27});assert.equal(await evaluate('document.activeElement.matches(".mobile-menu-btn")'),true);
  assert.equal(await evaluate('document.querySelector(".mobile-menu-btn").getAttribute("aria-expanded")'),'false');await size(1440);
 });
 await check('Project required fields prevent an empty create and preserve the profession choices',async()=>{
  await go('sites');await wait('document.querySelector("[data-action=add-site]")');await click('[data-action=add-site]');
  assert.deepEqual(await evaluate('[...document.querySelector("#site-profession").options].map(o=>o.text)'),['Engr','Architect']);
  await submit('#sites-form');assert.ok(await evaluate('document.querySelector("#sites-dialog").open && !document.querySelector("#site-name").validity.valid'));
  await capture('project-desktop-light');await size(768,1024);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  await size(390,844);await evaluate('document.body.classList.add("dark")');await capture('project-mobile-dark');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await click('[data-action=close-dialog]');await evaluate('document.body.classList.remove("dark")');await size(1440);
 });
 for(const [actor,role]of [['sky','engineer'],['architect','architect'],['handler','tool_handler']])await check(role+' navigation retains inventory, transfers and Returns with its role restrictions',async()=>{
  await logout();await login(actor);await wait('MCPAAuth.profile?.role==='+JSON.stringify(role));await go('dashboard');
  assert.ok(await evaluate('!!document.querySelector("[data-target=masterlist]") && !!document.querySelector("[data-target=transfer]") && !!document.querySelector("[data-target=return]")'));
  assert.equal(await evaluate('!!document.querySelector("[data-target=register-equipment]")'),false);
  if(role!=='tool_handler')assert.equal(await evaluate('!!document.querySelector("[data-target=users]")'),false);
  await go('return');await wait(role==='tool_handler'?'document.querySelector(".movement-ui h1")?.textContent==="Returns"':'!!document.querySelector("[data-integration-mount]")');
  await go('transfer?view=send');await wait('document.querySelector("[data-send]")');
  await command('Page.reload');await wait('document.querySelector("[data-nav-group=movements]")?.getAttribute("aria-expanded")==="true"');
  assert.equal(await evaluate('document.querySelector(".nav-item[aria-current=page]").dataset.target'),'transfer');
 });
 // Each synthetic mount uses the shipped component, with deliberately delayed/failed
 // server responses. Custody is changed in the mock only after its response resolves.
 const mount=async(config={})=>evaluate(`(async()=>{
  window.__qaMount?.destroy();window.MovementUI?.dispose();
  const root=document.createElement('section');root.id='frontend-qa';document.querySelector('#content').replaceChildren(root);
  const config=${JSON.stringify(config)},id=config.long?'TRANSFER-'+ 'X'.repeat(160):'TRANSFER-QA',assetId=config.long?'QA-'+ 'Y'.repeat(100):'QA-ASSET';
  const q=window.__qa={calls:[],failRead:!!config.failRead,failMutation:false,reads:0,holder:'sender',
   data:{profile:{id:config.sender?'sender':'receiver-b',role:'engineer'},assets:[{id:'QA-ASSET',name:'Synthetic drill'}],
    recipients:[{id:'receiver-a',name:'Same Name',role:'engineer'},{id:'receiver-b',name:'Same Name',role:'engineer'}],
    sites:[{id:'site-a',name:'Project A',assignedEngineerId:'receiver-a'},{id:'site-b',name:'Project B',assignedEngineerId:'receiver-b'}],evidence:[],
    transfers:config.sender?[]:[{id,status:config.status||'pending',actorId:'sender',sender:'Original Sender',receiver:'Same Name',receiverId:'receiver-b',
      destination:'Project B',toolIds:[assetId],source:[{toolId:assetId,holder:'Original Sender',condition:'Good'}],equipment:[{id:assetId,holder:'Original Sender'}],allowedActions:[]}]} };
  q.api={snapshot:async()=>{q.reads++;if(q.failRead)throw Error('Synthetic snapshot unavailable. Retry loading transfers.');return structuredClone(q.data);},mutate:async(action,payload)=>{
    q.calls.push({action,payload});if(q.failMutation)throw Error('Synthetic server rejected the action. Your changes are retained.');
    if(q.hold)await new Promise(resolve=>q.release=resolve);
    if(action==='receiveTransfer'){q.holder='receiver-b';Object.assign(q.data.transfers[0],{status:'received',inspections:payload.inspections,receivedAt:'2026-11-03T00:00:00Z',receivedBy:'Same Name'});q.data.transfers[0].equipment[0].holder='Same Name';}
    if(action==='createTransfer')q.data.transfers.push({id:'TRANSFER-NEW',status:'pending',actorId:'sender',sender:'Original Sender',receiverId:payload.receiverId,receiver:'Same Name',destination:payload.destination,toolIds:payload.toolIds,source:[],equipment:[],allowedActions:[]});
    return {id:action==='createTransfer'?'TRANSFER-NEW':id};}};
  window.__qaMount=await (await import('./js/upgrades/transfer-review/transfer.mjs')).mount(root,{api:q.api,view:config.sender?'send':config.status?'history':'receive'});
  root.querySelectorAll('[data-transfer-record]').forEach(e=>e.open=true);
 })()`);
 const inspect=async()=>{await fill('#frontend-qa [name=condition]','good');await click('#frontend-qa [name=received]');};
 await check('Duplicate recipient UUID remains visible in the incoming record',async()=>{
  await mount();assert.ok(await evaluate('document.querySelector("#frontend-qa [data-transfer-record]").textContent.includes("receiver-b")'));
 });
 await check('Pending server confirmation keeps original custody and prevents duplicate submissions',async()=>{
  await mount();await inspect();await evaluate('__qa.hold=true');await submit('#frontend-qa [data-accept]');await wait('__qa.calls.length===1');
  assert.equal(await evaluate('__qa.holder'),'sender');assert.ok(await evaluate('document.querySelector("#frontend-qa").textContent.includes("Pending Acceptance")'));
  await evaluate('document.querySelector("#frontend-qa [data-accept]").dispatchEvent(new SubmitEvent("submit",{bubbles:true,cancelable:true}))');assert.equal(await evaluate('__qa.calls.length'),1);
  await evaluate('__qa.release()');await wait('__qa.holder==="receiver-b" && !document.querySelector("#frontend-qa [data-accept]")');
  assert.equal(await evaluate('document.activeElement.matches("#frontend-qa [data-transfer-record]>summary")'),true);
 });
 await check('Mutation rejection retains inspection values and original custodian without a success claim',async()=>{
  await mount();await inspect();await fill('#frontend-qa [name=notes]','Retain my inspection notes');await evaluate('__qa.failMutation=true');await submit('#frontend-qa [data-accept]');
  await wait('document.querySelector("#frontend-qa .b-error")?.textContent.includes("rejected")');
  assert.equal(await evaluate('__qa.holder'),'sender');assert.equal(await evaluate('document.querySelector("#frontend-qa [name=notes]").value'),'Retain my inspection notes');
  assert.equal(await evaluate('document.querySelector("#frontend-qa [type=submit]").disabled'),false);
  assert.ok(await evaluate('!document.querySelector("#frontend-qa .b-feedback").textContent.includes("Custody updated")'));
 });
 await check('Damage validation blocks blank notes and recovers after selecting Good',async()=>{
  await mount();await fill('#frontend-qa [name=condition]','damaged');await click('#frontend-qa [name=received]');await submit('#frontend-qa [data-accept]');
  assert.equal(await evaluate('__qa.calls.length'),0);assert.ok(await evaluate('!document.querySelector("#frontend-qa [name=notes]").validity.valid'));
  await fill('#frontend-qa [name=condition]','good');assert.ok(await evaluate('document.querySelector("#frontend-qa [name=notes]").validity.valid'));
  await submit('#frontend-qa [data-accept]');await wait('__qa.holder==="receiver-b"');
 });
 await check('Failed initial snapshot offers a working retry instead of permanent loading copy',async()=>{
  await mount({failRead:true});assert.ok(await evaluate('!!document.querySelector("#frontend-qa [data-retry-transfers]")'));
  assert.ok(await evaluate('!document.querySelector("#frontend-qa .b-content").textContent.includes("Loading equipment records")'));
  await evaluate('__qa.failRead=false');await click('#frontend-qa [data-retry-transfers]');await wait('!!document.querySelector("#frontend-qa [data-accept]")');
 });
 await check('Confirmed acceptance followed by snapshot failure removes stale acceptance actions and recovers safely',async()=>{
  await mount();await inspect();await evaluate('__qa.failRead=true');await submit('#frontend-qa [data-accept]');await wait('__qa.holder==="receiver-b" && !!document.querySelector("#frontend-qa .b-error")');
  assert.equal(await evaluate('!!document.querySelector("#frontend-qa [data-accept]")'),false);
  assert.ok(await evaluate('!!document.querySelector("#frontend-qa [data-retry-transfers]")'));
  await evaluate('__qa.failRead=false');await click('#frontend-qa [data-retry-transfers]');await wait('document.querySelector("#frontend-qa [data-transfer-record]")?.textContent.includes("Accepted")');
  assert.equal(await evaluate('__qa.calls.length'),1);
 });
 await check('Failed background synchronization preserves an unsaved inspection',async()=>{
  await mount();await fill('#frontend-qa [name=notes]','Keep this draft');
  await evaluate('(async()=>{__qa.failRead=true;await __qaMount.refresh().catch(error=>window.__qaRefreshError=error.message);})()');
  assert.equal(await evaluate('document.querySelector("#frontend-qa [name=notes]").value'),'Keep this draft');
  assert.ok(await evaluate('__qaRefreshError.includes("snapshot unavailable")'));
  assert.equal(await evaluate('document.querySelector("#frontend-qa .b-content").getAttribute("aria-busy")'),'false');
 });
 await check('Outgoing duplicate selection sends the exact UUID and stays Pending Acceptance',async()=>{
  await mount({sender:true});await click('#frontend-qa [name=asset]');await fill('#frontend-qa [name=recipient]','receiver-b');await fill('#frontend-qa [name=destination]','Project B');
  assert.match(await evaluate('document.querySelector("#frontend-qa [data-recipient-confirmation]").textContent'),/receiver-b/);
  await submit('#frontend-qa [data-send]');await wait('__qa.calls.length===1 && !!document.querySelector("#frontend-qa [data-transfer-record]")');
  assert.equal(await evaluate('__qa.calls[0].payload.receiverId'),'receiver-b');assert.equal(await evaluate('__qa.holder'),'sender');
  assert.ok(await evaluate('document.querySelector("#frontend-qa [data-transfer-record]").textContent.includes("Pending Acceptance")'));
 });
 await check('Completed and unauthorized pending records expose no cancellation action',async()=>{
  for(const status of ['pending','received','rejected','canceled']){await mount({status});assert.equal(await evaluate('!!document.querySelector("#frontend-qa [data-adjust=cancelTransfer]")'),false);}
 });
 await check('Long transfer identifiers fit desktop, tablet and mobile in both themes',async()=>{
  await mount({long:true});const overflow=[];
  for(const [width,height]of [[1440,900],[768,1024],[390,844],[320,740]])for(const theme of ['light','dark']){
   await size(width,height);await evaluate('document.body.classList.toggle("dark",'+(theme==='dark')+')');
   await capture('transfer-'+width+'-'+theme);
   const metrics=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,content:document.querySelector("#frontend-qa").scrollWidth,box:document.querySelector("#frontend-qa").clientWidth})');
   if(metrics.scroll>metrics.width+1||metrics.content>metrics.box+1)overflow.push({width,theme,...metrics});
  }
  assert.deepEqual(overflow,[]);
 });
 await check('Navigation and transfer keyboard focus contrast reaches 3:1 in both themes',async()=>{
  await mount();await size(1440);await key('Tab','Tab',{windowsVirtualKeyCode:9});
  const luminance=color=>{const parts=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return parts[0]*.2126+parts[1]*.7152+parts[2]*.0722;};
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const theme of ['light','dark']){
   await evaluate('document.body.classList.toggle("dark",'+(theme==='dark')+')');
   for(const [selector,surface]of [['#frontend-qa [name=condition]','body'],['[data-nav-group=movements]','#sidebar']]){
    const styles=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();return {outline:getComputedStyle(el).outlineColor,style:getComputedStyle(el).outlineStyle,surface:getComputedStyle(document.querySelector(${JSON.stringify(surface)})).backgroundColor};})()`);
    assert.equal(styles.style,'solid');assert.ok(contrast(styles.outline,styles.surface)>=3,JSON.stringify({theme,selector,...styles}));
   }
  }
 });
 await check('Local QR pixels preserve Unicode, punctuation and long Asset IDs',async()=>{
  const decode=require('jsqr');
  for(const id of ['QA-ñ-日本-🔧',"QA-'\"<>&",'QA-'+ 'Z'.repeat(120)]){
   const p=await evaluate(`(async()=>{const img=MCPAEquipmentQR.image(${JSON.stringify(id)},512);await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);return {pixels:Array.from(x.getImageData(0,0,c.width,c.height).data),width:c.width,height:c.height};})()`);
   assert.equal(decode(new Uint8ClampedArray(p.pixels),p.width,p.height)?.data,id);
  }
 });
 await evaluate('window.__qaMount?.destroy()');
 await check('Request interception permits only the ephemeral loopback server',async()=>{assert.ok(networkAudit.localRequestsAllowed>0);assert.equal(networkAudit.nonlocalHttpResponses,0);});
 const report={passed:results.filter(r=>r.result==='PASS').length,failed:results.filter(r=>r.result==='FAIL').length,blocked:0,networkAudit,cases:results};
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log('QA RESULTS '+JSON.stringify({passed:report.passed,failed:report.failed,output:path.relative(path.join(__dirname,'../..'),output)}));
 assert.equal(report.failed,0,'Supplemental frontend checks failed; inspect results.json');
};
