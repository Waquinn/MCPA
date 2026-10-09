// Helpers for auth.browser.cjs. All data changes use its isolated PostgreSQL fixture.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');

exports.header=async({evaluate,command,wait,click,fill,go,shot})=>{
 await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await evaluate(`window.__transitionCount=0;window.__startTransition=document.startViewTransition.bind(document);document.startViewTransition=update=>{window.__transitionCount++;window.__transitionOrigin={x:parseFloat(document.documentElement.style.getPropertyValue('--theme-x')),y:parseFloat(document.documentElement.style.getPropertyValue('--theme-y')),radius:parseFloat(document.documentElement.style.getPropertyValue('--theme-radius'))};return window.__lastTransition=window.__startTransition(update);}`);
 for(const width of [375,393,430,768,1024,1440]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:852,deviceScaleFactor:1,mobile:width<=768});
  await go('request');await wait("document.querySelector('[data-list]')");
  for(const dark of [true,false]){
   const rect=await evaluate("(()=>{const r=document.querySelector('.theme-toggle').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
   await click('.theme-toggle');
   await evaluate('window.__lastTransition.ready');
   const origin=await evaluate('window.__transitionOrigin');
   assert.equal(origin.x,rect.x);assert.equal(origin.y,rect.y);
   assert.ok(origin.radius>=Math.hypot(Math.max(rect.x,width-rect.x),Math.max(rect.y,852-rect.y))-.01);
   assert.equal(await evaluate("getComputedStyle(document.documentElement,'::view-transition-new(root)').animationName"),'theme-reveal');
   if(width===393 && dark)await shot('theme-reveal-mobile',true);
   await evaluate('window.__lastTransition.finished');
   await wait("!document.documentElement.classList.contains('theme-transition')");
   assert.equal(await evaluate("document.body.classList.contains('dark')"),dark);
   assert.equal(await evaluate("localStorage.getItem('mcpa.theme')"),dark?'dark':'light');
   assert.equal(await evaluate("document.querySelector('.theme-toggle').getAttribute('aria-label')"),dark?'Switch to light mode':'Switch to night mode');
   assert.ok(await evaluate("!document.body.innerText.includes('Live database') && !document.querySelector('[data-action=refresh]')"));
   if(width<=768){
    assert.ok(await evaluate("getComputedStyle(document.querySelector('.mobile-search-toggle')).display!=='none' && getComputedStyle(document.querySelector('.search-wrap')).display==='none'"));
    await click('#mobile-search-toggle');
    assert.equal(await evaluate('document.activeElement.id'),'global-search-input');
    assert.ok(await evaluate("(()=>{const r=document.querySelector('#global-search-panel').getBoundingClientRect(),i=document.querySelector('#global-search-input').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && i.width>innerWidth*.65 && document.documentElement.scrollWidth<=innerWidth})()"));
    if([393,430].includes(width))await shot('mobile-search-'+width+'-'+(dark?'dark':'light'));
    await fill('#global-search-input','TOOL-001');
    await wait("document.querySelector('#equipmentTableBody')?.textContent.includes('TOOL-001') && document.querySelector('#searchEquipment')?.value==='TOOL-001'");
    assert.ok(await evaluate("document.querySelector('#global-search-panel').classList.contains('is-open')"));
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await evaluate('document.activeElement.id'),'mobile-search-toggle');
    assert.equal(await evaluate("document.querySelector('#mobile-search-toggle').getAttribute('aria-expanded')"),'false');
    await click('#mobile-search-toggle');await click('.mobile-search-close');
    assert.equal(await evaluate('document.activeElement.id'),'mobile-search-toggle');
    await click('#mobile-search-toggle');await click('.bell-wrap');
    await wait("document.querySelector('#screen-activity.active #overview-results')");
    assert.equal(await evaluate("document.querySelector('#global-search-panel').classList.contains('is-open')"),false);
    await click('#account-menu summary');assert.ok(await evaluate("document.querySelector('#account-menu').open"));await click('#account-menu summary');
   }else{
    assert.ok(await evaluate("getComputedStyle(document.querySelector('.mobile-search-toggle')).display==='none' && document.querySelector('#global-search-input').getBoundingClientRect().width>250"));
    if(width===1440)await shot('header-desktop-'+(dark?'dark':'light'));
   }
  }
 }
 const before=await evaluate('window.__transitionCount');
 await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await click('.theme-toggle');assert.equal(await evaluate('window.__transitionCount'),before);
 assert.ok(await evaluate("document.body.classList.contains('dark')"));
 await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await evaluate('document.startViewTransition=undefined');await click('.theme-toggle');
 assert.equal(await evaluate('window.__transitionCount'),before);
 assert.equal(await evaluate("document.body.classList.contains('dark')"),false);
 await evaluate('document.startViewTransition=window.__startTransition');await evaluate('toggleTheme()');
 await command('Page.reload');await wait("document.querySelector('#screen-request.active [data-list]')");
 assert.ok(await evaluate("document.body.classList.contains('dark') && !document.documentElement.classList.contains('theme-transition') && document.querySelector('#theme-label').textContent==='Light mode'"));
 await evaluate('toggleTheme()');
 console.log('PASS Header at 375/393/430/768/1024/1440: both theme reveals, actual origin, saved preference, fallback, reduced motion, search/filtering, close/Escape, account and activity access');
};

exports.sync=async({fixture,evaluate,command,wait,fill,go,login,logout,calls})=>{
 const action=(actor,name,payload)=>fixture.rpc(fixture.actors[actor],'mcpa_movement_action',{p_action:name,p_payload:payload,p_operation_id:randomUUID()});
 await fixture.query(fixture.actors.admin,"insert into public.equipment(id,asset_id,name,quantity,status) values($1,'SYNC-TOOL','Synchronization fixture tool',1,'AVAILABLE')",[randomUUID()]);
 await login('admin');await wait("document.querySelector('.admin-review')");await go('request');await wait("document.querySelector('[data-list]')");
 const req=await action('sky','createRequest',{toolIds:['SYNC-TOOL'],destination:'Casa Buena',purpose:'Isolated automatic sync test'});
 await evaluate('__tickSync()');
 await wait("document.querySelector('[data-list]')?.textContent.includes("+JSON.stringify(req.id)+")");
 assert.equal(await evaluate('window.__channels.size'),1);assert.equal(await evaluate('window.__syncTimers.size'),1);
 await logout();await login('sky');await wait("document.querySelector('.overview-actions')");await go('request');await wait("document.querySelector('[name=purpose]')");
 await fill('[name=purpose]','Keep my unsaved draft');
 await action('admin','approveRequest',{id:req.id});await evaluate('__tickSync()');
 await wait("MovementStore.getState().requests.find(r=>r.id==="+JSON.stringify(req.id)+")?.status==='approved'");
 assert.equal(await evaluate("document.querySelector('[name=purpose]').value"),'Keep my unsaved draft');
 const trf=await action('admin','releaseRequest',{id:req.id});await evaluate('showScreen('+JSON.stringify('transfer?record='+trf.id)+')');
 await wait("document.querySelector('[data-detail]:not([hidden])')?.textContent.includes("+JSON.stringify(trf.id)+")");
 await action('sky','receiveTransfer',{id:trf.id,inspections:[{toolId:'SYNC-TOOL',condition:'good',tested:true,notes:''}]});
 await evaluate('__tickSync()');await wait("document.querySelector('[data-detail]')?.textContent.includes('Inspected / completed')");
 assert.equal(await evaluate("MovementStore.getState().tools.find(t=>t.id==='SYNC-TOOL').holderId"),fixture.actors.sky.id);
 await go('activity');await wait("document.querySelector('#overview-results')");
 const rep=await action('sky','reportRepair',{toolId:'SYNC-TOOL',notes:'Isolated sync fixture damage'});
 await evaluate('__tickSync()');await wait("document.querySelector('#overview-results').textContent.includes("+JSON.stringify(rep.id)+")");
 await go('request');await wait("document.querySelector('[data-list]')");
 await fill('[name=purpose]','Draft survives lost connectivity');
 await evaluate('window.__failReads=true;__tickSync()');
 await wait("document.querySelector('[data-sync-warning]').textContent.includes('Unable to sync')");
 assert.equal(await evaluate("document.querySelector('[name=purpose]').value"),'Draft survives lost connectivity');
 await evaluate('window.__failReads=false;window.dispatchEvent(new Event("online"))');
 await wait("document.querySelector('[data-sync-warning]').textContent===''");
 assert.equal(await evaluate("document.querySelector('[name=purpose]').value"),'Draft survives lost connectivity');
 for(const screen of ['transfer','activity','request']){await go(screen);await wait("document.querySelector('#screen-"+screen+".active')");}
 assert.equal(await evaluate('window.__channels.size'),1);assert.equal(await evaluate('window.__syncTimers.size'),1);
 assert.deepEqual(await evaluate('[...window.__channels][0].tables'),['equipment','sites']);
 await logout();assert.equal(await evaluate('window.__channels.size'),0);assert.equal(await evaluate('window.__syncTimers.size'),0);
 await login('admin');await wait("document.querySelector('.admin-review')");await go('users');await wait("document.querySelector('#accounts-list tbody tr')");
 await fixture.rpc(fixture.actors.admin,'mcpa_save_account',{p_id:fixture.actors.pau.id,p_name:'Engineer Pau updated in fixture',p_role:'engineer',p_status:'active',p_auth_user_id:fixture.actors.pau.authId});
 await evaluate('__tickSync()');await wait("document.querySelector('#accounts-list').textContent.includes('Engineer Pau updated in fixture')");
 assert.deepEqual(await evaluate('[...window.__channels][0].tables'),['mcpa_account_audit']);
 await logout();assert.equal(await evaluate('window.__channels.size'),0);assert.equal(await evaluate('window.__syncTimers.size'),0);
 console.log('PASS Automatic request/approval/release/receipt/custody/activity/people updates, drafts preserved, outage recovery, and channel/timer cleanup; isolated database only');
};
