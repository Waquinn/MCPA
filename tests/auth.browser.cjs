// Browser transport models Supabase Auth; RPCs and RLS run against real local PostgreSQL.
// External resources are blocked. No requests to the live Supabase project.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process'),{once}=require('node:events'),{authDatabase}=require('./auth-test-db.cjs');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'mcpa-auth-'));
let fixture,chrome,socket,passwordLogged=false;const errors=[],calls=[];
const sdk=`window.__syncTimers=new Map();const realInterval=window.setInterval,realClear=window.clearInterval;window.setInterval=(fn,ms,...args)=>{const id=realInterval(fn,ms,...args);if(ms===30000)__syncTimers.set(id,fn);return id;};window.clearInterval=id=>{__syncTimers.delete(id);realClear(id);};window.__tickSync=()=>__syncTimers.forEach(fn=>fn());window.__channels=new Set();
window.supabase={createClient(){let listener;const session=()=>{const key=localStorage.getItem('fixture.account');return key?{user:{id:key},access_token:key}:null};const request=q=>window.__failReads&&q.rpc==='mcpa_movement_snapshot'?Promise.resolve({error:{code:'TEST'}}):fetch('/__db',{method:'POST',headers:{'Authorization':session()?.access_token||''},body:JSON.stringify(q)}).then(r=>r.json());window.__authEvent=event=>listener?.(event,session());window.__expire=()=>{localStorage.removeItem('fixture.account');listener?.('SIGNED_OUT',null)};return {
 channel(){const c={tables:[],on(_type,filter,fn){this.tables.push(filter.table);this.notify=fn;return this},subscribe(){return this}};__channels.add(c);return c;},removeChannel(c){__channels.delete(c);return Promise.resolve();},
 auth:{getSession:async()=>({data:{session:session()}}),onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}}},async signInWithPassword({email,password}){const key=email.split('@')[0];if(!['admin','sky','pau','architect','secretary','handler','inactive','missing'].includes(key)||password!=='test-password')return {error:{code:'invalid_credentials'}};localStorage.setItem('fixture.account',key);listener?.('SIGNED_IN',session());return {data:{session:session()}}},async signOut(){localStorage.removeItem('fixture.account');listener?.('SIGNED_OUT',null);return {error:null}},resetPasswordForEmail:async()=>({error:null}),updateUser:async values=>{window.__savedPassword=values.password;return {error:null}} },
 functions:{invoke:async(name,{body})=>{if(body.action==='capabilities')return {data:window.__accountCapabilities||{invitations_enabled:true,development_enabled:true,pending_development_accounts:[]}};window.__accountRequest={name,body};return window.__developmentFailure?{error:{context:{json:async()=>({error:'Creation interrupted. Retry the same test account.'})}}}:{data:{message:body.action==='invite'?'Invitation sent.':'Test account created.'}};}},
 rpc(name,args){return request({rpc:name,args})},from(table){const q={table,columns:'*',filters:[]};return {select(cols='*'){q.columns=cols;return this},order(){return this},limit(n){q.end=n-1;return this},range(start,end){q.start=start;q.end=end;return this},eq(key,value){q.filters.push([key,value]);return this},then(resolve,reject){return request(q).then(resolve,reject)}}}
}}};`;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/__sdk.js'){res.setHeader('Content-Type','text/javascript');res.end(sdk);return;}
 if(req.url==='/__db'){
  let body='';for await(const part of req)body+=part;const q=JSON.parse(body),actor=fixture.actors[req.headers.authorization];calls.push({rpc:q.rpc,table:q.table,actor:req.headers.authorization});
  let data=null,error=null,count=null;
  try{
   if(q.rpc){data=await fixture.rpc(actor,q.rpc,q.args||{});}
   else{
    if(!['equipment','sites','profiles','consumables','consumable_requests','consumable_stock_movements','project_history','mcpa_account_audit'].includes(q.table))throw new Error('Unsupported test table');
    const cols=q.columns==='*'?'*':q.columns.split(',').map(c=>{if(!/^[a-z_]+$/.test(c))throw new Error('Bad column');return '"'+c+'"'}).join(',');
    let rows=(await fixture.query(actor,`select ${cols} from public.${q.table}`)).rows;
    rows=rows.filter(r=>q.filters.every(([key,value])=>r[key]===value));count=rows.length;data=rows.slice(q.start||0,(q.end??999)+1);
   }
  }catch(e){error={code:e.code||'TEST',message:e.message};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error,count}));return;
 }
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 let content=fs.readFileSync(file);if(file.endsWith('index.html'))content=content.toString().replace(/<script src="https:[^"]+"[^>]*><\/script>/g,'').replace('</head>','<script src="/__sdk.js"></script></head>');
 res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[path.extname(file)]||'text/plain');res.end(content);
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fixture=await authDatabase({engineerPortal:true});fixture.actors.missing={authId:require('node:crypto').randomUUID()};
 await fixture.db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'MCPA Development Transfer Test','Local fixture only','Engr Sky',$2)",[require('node:crypto').randomUUID(),fixture.actors.sky.id]);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){const p=path.join(profile,'DevToolsActivePort');if(fs.existsSync(p)){port=fs.readFileSync(p,'utf8').split('\n')[0];break;}await pause(100);}assert.ok(port);
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(socket,'open');
 let next=0;const pending=new Map();socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&JSON.stringify(m.params.args).includes('Local-browser-fixture'))passwordLogged=true;const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>reject(new Error('CDP timeout '+method)),10000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.result.description);return r.result.value;};
 const wait=async expression=>{for(let i=0;i<160;i++){if(await evaluate(expression))return;await pause(50);}throw new Error('Timed out: '+expression+'\n'+await evaluate('document.body.innerText'));};
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const fill=(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const submit=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
 const go=async route=>{await evaluate(`showScreen(${JSON.stringify(route)})`);await wait(`document.querySelector('#screen-${route}.active')`);};
 const login=async(key,password='test-password')=>{await wait("document.querySelector('#auth-email')");await fill('#auth-email',key+'@example.test');await fill('#auth-password',password);await submit('#auth-form');};
 const logout=async()=>{await evaluate('MCPAAuth.logout()');await wait("document.querySelector('#auth-email')");};
 const shot=async (name,viewport=false)=>{if(process.env.MCPA_SKIP_SCREENSHOTS==='1')return;await pause(300);const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:!viewport});fs.writeFileSync(path.join(profile,name+'.png'),Buffer.from(data,'base64'));console.log('SCREENSHOT '+path.join(profile,name+'.png'));};
 await command('Runtime.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});await command('Page.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 const base=`http://127.0.0.1:${server.address().port}`;
 await command('Page.navigate',{url:base+'/2-engr/index.html#users'});await wait("document.querySelector('#auth-email')");
 assert.equal(calls.length,0,'Protected pages do not fetch business records while signed out');
 assert.ok(await evaluate("document.getElementById('app-shell').classList.contains('hidden') && !document.body.classList.contains('dark')"));
 await shot('login-light');
 const enter=async selector=>{
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 };
 await fill('#auth-email','admin@example.test');await fill('#auth-password','test-password');
 await click('[data-auth-toggle-password]');
 assert.ok(await evaluate("document.querySelector('#auth-password').type==='text' && document.querySelector('[data-auth-toggle-password]').getAttribute('aria-label')==='Hide password' && !localStorage.getItem('fixture.account')"));
 await click('[data-auth-toggle-password]');
 assert.ok(await evaluate("document.querySelector('#auth-password').type==='password' && document.querySelector('#auth-password').value==='test-password'"));
 await command('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});
 await shot('login-mobile');
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
 await enter('#auth-password');await wait("MCPAAuth.profile?.role==='admin' && !document.querySelector('#app-shell').classList.contains('hidden')");await logout();
 await fill('#auth-email','admin@example.test');await fill('#auth-password','test-password');
 await enter('#auth-email');await wait("document.querySelector('.admin-review')");await logout();
 await fill('#auth-email','admin@example.test');await enter('#auth-email');
 assert.ok(await evaluate("!localStorage.getItem('fixture.account') && document.querySelector('#auth-password').matches(':invalid')"));
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await login('sky','wrong');await wait("document.querySelector('#auth-feedback').textContent.includes('Incorrect')");
 await login('inactive');await wait("document.querySelector('#auth-feedback').textContent.includes('inactive')");await logout();
 await login('missing');await wait("document.querySelector('#auth-feedback').textContent.includes('not assigned')");await logout();
 await login('admin');await wait("document.querySelector('.admin-review')");
 if(process.argv.includes('--portal')){
  await require('./engineer-portal.browser-checks.cjs').verify({fixture,evaluate,command,wait,click,fill,submit,go,login,logout,calls,shot});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Engineer portal browser checks; isolated database only');return;
 }
 if(!process.argv.includes('--flows-only')){
 const headerBaseline=await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot');
 await require('./workspace-ui-checks.cjs').header({evaluate,command,wait,click,fill,go,shot});
 if(process.argv.includes('--theme-only')){
  assert.deepEqual(await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot'),headerBaseline,'Theme checks preserve fixture records');
  assert.equal(calls.filter(call=>call.rpc==='mcpa_movement_action').length,0,'Theme checks perform no business writes');
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Theme browser checks; fixture records unchanged');
  return;
 }
 await require('./mobile-search-ui-checks.cjs').verify({evaluate,command,wait,click,fill,go,login,logout});
 assert.deepEqual(await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot'),headerBaseline,'Theme/search interactions preserve all fixture records');
 assert.equal(calls.filter(call=>call.rpc==='mcpa_movement_action').length,0,'Theme/search checks perform no business writes');
 if(process.argv.includes('--header-only')){
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Read-only theme/search browser checks; fixture records unchanged');
  return;
 }
 }
 await go('dashboard');await wait("document.querySelector('.admin-review')");
 assert.ok(await evaluate("!document.querySelector('#movement-profile') && !document.body.innerText.includes('Open Engineer') && !document.querySelector('.dashboard-toolbar .overview-actions')"));
 await command('Page.reload');await wait("document.querySelector('.admin-review')");
 await go('request');await wait("document.querySelector('[data-list]')");assert.ok(await evaluate("!document.querySelector('[data-form=create]')"));
 await go('transfer');await wait("document.querySelector('[data-list]')");assert.ok(await evaluate("!document.querySelector('[data-form=create]') && !document.querySelector('[data-form=lookup]')"));
 await go('users');await wait("document.querySelector('#account-profile option[value]') && document.querySelector('#accounts-list tbody tr')");

 await click('[data-open-invite]');await wait("!document.querySelector('#invite-panel').hidden");
 assert.equal(await evaluate("!!document.querySelector('#invite-role option[value=admin]')"),false);
 assert.equal(await evaluate("document.querySelector('#recovery-panel').open"),false);
 await fill('#invite-name','Engr Sky');assert.equal(await evaluate("document.querySelector('#distinct-person-label').hidden"),false);
 await shot('accounts-desktop');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('accounts-mobile');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

 await fill('#invite-name','New Engineer');await fill('#invite-email','new@example.test');await fill('#invite-role','engineer');await submit('#invite-form');
 await wait("document.querySelector('#accounts-feedback')?.textContent==='Invitation sent.'");
 const inviteRequest=await evaluate('window.__accountRequest');assert.equal(inviteRequest.name,'manage-accounts');assert.equal(inviteRequest.body.role,'engineer');assert.equal(inviteRequest.body.profile_id,null);assert.equal(inviteRequest.body.email,'new@example.test');
 assert.equal(await evaluate("document.querySelector('#invite-panel').hidden"),true);
 await wait("!document.querySelector('#development-form button[type=submit]').disabled");
 await evaluate("window.__accountCapabilities={invitations_enabled:false,development_enabled:true,pending_development_accounts:[]}");
 await evaluate('window.dispatchEvent(new Event("focus"))');await wait("document.querySelector('#account-availability').textContent.includes('not yet configured')");
 assert.equal(await evaluate("document.querySelector('[data-open-invite]').disabled"),true);
 assert.deepEqual(await evaluate("[...document.querySelector('#development-role').options].map(o=>o.value)"),['engineer','architect']);
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-label')"),'Show password');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-controls')"),'development-password');
 await shot('development-accounts-desktop');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('development-accounts-mobile');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await fill('#development-name','Development Engineer A');await fill('#development-email','deva@example.test');
 await fill('#development-password','Local-browser-fixture-2026!');
 const toggleIcon=await evaluate("document.querySelector('#development-password-toggle').innerHTML");
 const pointer=await evaluate("(()=>{const input=document.querySelector('#development-password');input.scrollIntoView({block:'center'});input.focus();input.setSelectionRange(3,7);const r=document.querySelector('#development-password-toggle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pointer});
 await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pointer});
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'text');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-label')"),'Hide password');
 assert.notEqual(await evaluate("document.querySelector('#development-password-toggle').innerHTML"),toggleIcon);
 assert.deepEqual(await evaluate("[document.activeElement.id,document.querySelector('#development-password').selectionStart,document.querySelector('#development-password').selectionEnd]"),['development-password',3,7],'Pointer toggle preserves input focus and selection');
 await click('#development-password-toggle');
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-label')"),'Show password');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 assert.equal(await evaluate('document.activeElement.id'),'development-password-toggle','Toggle is next in keyboard tab order');
 await enter('#development-password-toggle');
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'text');
 assert.equal(await evaluate('document.activeElement.id'),'development-password-toggle','Keyboard activation keeps button focus');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});
 await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password');
 assert.equal(await evaluate("window.__accountRequest.body.action"),'invite','Visibility toggles never submit the creation form');
 await click('#development-password-toggle');
 await evaluate('window.__developmentFailure=true');await submit('#development-form');
 await wait("document.querySelector('#accounts-feedback').textContent.includes('Creation interrupted')");
 assert.equal(await evaluate("document.querySelector('#development-password').value"),'');
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password','Failure also restores hidden state');
 assert.equal(await evaluate("document.querySelector('#development-name').value"),'Development Engineer A');
 const failedRequest=await evaluate('window.__accountRequest.body');
 await wait("!document.querySelector('#development-form button').disabled");
 await evaluate('window.__developmentFailure=false');await fill('#development-password','Local-browser-fixture-2026!');await click('#development-password-toggle');await submit('#development-form');
 await wait("document.querySelector('#accounts-feedback').textContent==='Test account created.'");
 const developmentRequest=await evaluate('window.__accountRequest');
 assert.equal(developmentRequest.name,'manage-accounts');assert.equal(developmentRequest.body.action,'createDevelopmentAccount');
 assert.equal(developmentRequest.body.role,'engineer');assert.equal(developmentRequest.body.id,failedRequest.id,'Retry keeps the request identity');
 assert.equal(await evaluate("document.querySelector('#development-password').value"),'');
 assert.equal(await evaluate("document.querySelector('#development-password').type"),'password','Success restores hidden state');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').getAttribute('aria-label')"),'Show password');
 assert.equal(await evaluate("document.querySelector('#development-password-toggle').innerHTML"),toggleIcon);
 assert.equal(await evaluate("document.body.innerText.includes('Local-browser-fixture')"),false);
 assert.equal(passwordLogged,false,'Temporary password is never logged');
 assert.equal(await evaluate("JSON.stringify({...localStorage,...sessionStorage}).includes('Local-browser-fixture')"),false);
 assert.equal(await evaluate("document.querySelector('[data-open-invite]').disabled"),true,'Completing development creation does not enable invitations');
 await wait("!document.querySelector('[data-audit]').disabled");
 await click('[data-audit]');await wait("document.querySelector('#account-audit').textContent.length>0");
 await go('dashboard');await wait("document.querySelector('.admin-review')");await evaluate('toggleTheme()');await shot('admin-dark');
 await logout();assert.equal(await evaluate("MovementStore.getState().tools.length"),0);
 await login('sky');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");
 await evaluate("showScreen('users')");await wait("document.querySelector('#content').textContent.includes('Access restricted')");
 await go('request');await wait("document.querySelector('[data-form=create]')");
 const key=async(key,code,windowsVirtualKeyCode)=>{
  await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});
 };
 for(const width of [375,390,430,768,1440]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});
  await command('Emulation.setTouchEmulationEnabled',{enabled:width<900});
  await pause(200);
  const control=await evaluate(`(()=>{const s=document.querySelector('#mv-destination');s.scrollIntoView({block:'center'});const r=s.getBoundingClientRect();return {tag:s.tagName,disabled:s.disabled,x:r.x+r.width/2,y:r.y+r.height/2,left:r.left,right:r.right,height:r.height,font:parseFloat(getComputedStyle(s).fontSize),options:[...s.options].map(o=>o.value),top:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===s};})()`);
  assert.equal(control.tag,'SELECT');assert.equal(control.disabled,false);assert.equal(control.top,true);
  assert.ok(control.left>=0 && control.right<=width && control.height>=44);
  if(width<=768)assert.ok(control.font>=16);
  assert.ok(control.options.includes('MCPA Development Transfer Test'));
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  if(width<900){
   await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:control.x,y:control.y}]});
   await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await evaluate("document.querySelector('#mv-destination').focus()");}
  await key('End','End',35);await key('Enter','Enter',13);
  assert.equal(await evaluate("document.querySelector('#mv-destination').value"),'MCPA Development Transfer Test');
  if([375,1440].includes(width))await shot('project-select-'+width);
 }
 await command('Emulation.setTouchEmulationEnabled',{enabled:false});
 console.log('PASS Native project select: touch hit targets, keyboard selection, all options and viewport fit at 375/390/430/768/1440');
 await click('[name="toolIds"][value="TOOL-001"]');await fill('[name=destination]','Casa Buena');await fill('[name=purpose]','Structural works');await submit('[data-form=create]');
 await wait("document.querySelector('[data-list]').textContent.includes('Pending review')");
 const request=await evaluate('MovementStore.getState().requests[0]');
 await logout();await login('admin');await wait("document.querySelector('.admin-review')");
 const beforeNavigation=await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot');
 const writeCount=calls.filter(c=>c.rpc==='mcpa_movement_action').length;
 for(const width of [375,390,430,768,1440]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});
  await command('Emulation.setTouchEmulationEnabled',{enabled:width<900});
  await go('activity');await wait("document.querySelector('a[data-movement-link]')");
  assert.equal(await evaluate("document.querySelector('a[data-movement-link]').getAttribute('href')"),'#request?record='+request.id);
  if([375,1440].includes(width))await shot('activity-links-'+width);
  if(width===1440)await enter('a[data-movement-link]');
  else{
   const point=await evaluate("(()=>{const row=document.querySelector('.activity-linked-row');row.scrollIntoView({block:'center'});const r=row.querySelector('td').getBoundingClientRect();const x=r.left+12,y=r.top+12;return {x,y,linked:!!document.elementFromPoint(x,y)?.closest('a[data-movement-link]')};})()");
   assert.ok(point.linked,'The first cell, outside the link text, is tappable');
   await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
   await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await wait("document.querySelector('#screen-request.active [data-detail]:not([hidden])')?.textContent.includes('Pending review') && document.activeElement.matches('[data-detail]')");
  assert.equal(await evaluate('location.hash'),'#request?record='+request.id);
  assert.ok(await evaluate("document.querySelector('.mv-selected-row').textContent.includes("+JSON.stringify(request.id)+") && document.querySelector('dialog[data-detail][open]') && !document.querySelector('#sidebar.open')"));
  if([375,1440].includes(width)){
   await shot('targeted-request-'+width);
   await command('Page.reload');
   await wait("document.querySelector('#screen-request.active [data-detail]:not([hidden])')?.textContent.includes('Pending review') && document.activeElement.matches('[data-detail]')");
  }
 }
 await command('Emulation.setTouchEmulationEnabled',{enabled:false});
 await go('dashboard');await wait("document.querySelector('.asset-timeline a[data-movement-link]')");
 await enter('.asset-timeline a[data-movement-link]');
 await wait("document.querySelector('[data-detail]:not([hidden])')?.textContent.includes('Pending review')");
 await evaluate("location.hash='#request?record=does-not-exist'");
 await wait("document.querySelector('[data-notice]')?.textContent.includes('unavailable')");
 assert.ok(await evaluate("!document.querySelector('[data-detail]').open"));
 await evaluate("location.hash="+JSON.stringify('#request?record='+request.id));
 await wait("document.querySelector('[data-detail]:not([hidden])')?.textContent.includes('Pending review')");
 assert.deepEqual(await fixture.rpc(fixture.actors.admin,'mcpa_movement_snapshot'),beforeNavigation,'Opening notification targets preserves requests, custody and activity');
 assert.equal(calls.filter(c=>c.rpc==='mcpa_movement_action').length,writeCount,'Navigation only reads data');
 console.log('PASS Activity/dashboard links, full-row touch, keyboard, deep-link refresh, missing record and unchanged pending request at all five widths');
 await require('./notification-ui-checks.cjs').targeting({fixture,request,evaluate,command,wait,click,go,enter,calls,shot,login,logout});
 await go('request');await wait("document.querySelector('[data-action=view]')");await click('[data-action=view]');await click('[data-action=approve]');await wait("document.querySelector('[data-action=release]')");await click('[data-action=release]');await wait("MovementStore.getState().transfers.some(t=>t.requestId==="+JSON.stringify(request.id)+")");
 const transfer=await evaluate('MovementStore.getState().transfers.find(t=>t.requestId==='+JSON.stringify(request.id)+')');assert.equal(await evaluate("MovementStore.getState().tools.find(t=>t.id==='TOOL-001').holder"),'');
 await logout();await login('sky');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");await go('transfer');await wait("document.querySelector('[data-form=lookup]')");await click('[data-transfer-tab=receive]');await fill('[name=code]',transfer.code);await submit('[data-form=lookup]');await wait("document.querySelector('[data-form=receive]')");await fill('[data-condition]','good');await submit('[data-form=receive]');await wait("document.querySelector('[data-notice]').textContent.includes('Test each')");await click('[data-tested]');await submit('[data-form=receive]');await wait("document.querySelector('[data-notice]').textContent.includes('Receipt confirmed')");
 assert.equal(await evaluate("MovementStore.getState().tools.find(t=>t.id==='TOOL-001').holder"),'Engr Sky');
 await go('return');await wait("document.querySelector('[data-form=create]')");await click('[name="toolIds"][value="TOOL-001"]');await fill('[name=destination]','Main Warehouse');await fill('[data-condition]','damaged');await fill('[data-condition-notes]','Guard broken');await submit('[data-form=create]');await wait("MovementStore.getState().repairs.some(r=>r.toolId==='TOOL-001')");
 await go('dashboard');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('engineer-mobile-dark');
 await evaluate('__expire()');await wait("document.querySelector('#auth-email')");assert.equal(await evaluate('MovementStore.getState().tools.length'),0);
 await login('architect');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");assert.equal(await evaluate('MCPAAuth.profile.role'),'architect');await logout();
 await login('secretary');await wait("document.querySelector('#screen-consumables.active') && document.querySelector('#consumables-feedback')");assert.ok(await evaluate("!document.querySelector('[data-target=masterlist]') && !document.querySelector('[data-target=users]')"));await evaluate("showScreen('dashboard')");await wait("document.querySelector('#content').textContent.includes('Access restricted')");await logout();
 await login('handler');await wait("document.querySelector('.overview-kpis')");assert.ok(await evaluate("!document.querySelector('.dashboard-toolbar .overview-actions') && !document.querySelector('[data-target=users]')"));await go('transfer');await wait("document.querySelector('[data-form=create]')");await logout();
 const before=calls.length;await click('[data-auth-demo]');await click('[data-demo-role=engineer]');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");assert.equal(await evaluate('MovementStore.mode'),'demo');await go('request');await wait("document.querySelector('[name=toolIds][value=\"GRD-002\"]')");await click('[name=toolIds][value="GRD-002"]');await fill('[name=destination]','Casa Buena');await fill('[name=purpose]','Demo only');await submit('[data-form=create]');await wait("MovementStore.getState().requests.length===1");await command('Page.reload');await wait("document.querySelector('[data-list]')?.textContent.includes('GRD-002')");assert.equal(calls.length,before,'Offline demo performs no live RPC/table requests');
 await logout();await click('[data-auth-demo]');await click('[data-demo-role=admin]');await wait("document.querySelector('.admin-review')");await go('request');await wait("document.querySelector('[data-list]')?.textContent.includes('GRD-002')");await click('[data-action=view]');await click('[data-action=approve]');await wait("document.querySelector('[data-action=release]')");
 await click('[data-action=release]');await wait("MovementStore.getState().transfers.length===1");const demoTransfer=await evaluate('MovementStore.getState().transfers[0]');
 await logout();await click('[data-auth-demo]');await click('[data-demo-role=engineer]');await wait("document.querySelector('.dashboard-toolbar .overview-actions')");await go('transfer');await wait("document.querySelector('[data-form=lookup]')");await click('[data-transfer-tab=receive]');await fill('[name=code]',demoTransfer.code);await submit('[data-form=lookup]');await wait("document.querySelector('[data-form=receive]')");await fill('[data-condition]','damaged');await fill('[data-condition-notes]','Damage found during demo inspection');
 assert.ok(await evaluate("!document.querySelector('[data-decision-field]').hidden && !document.querySelector('[data-disposition]').disabled"));
 await fill('[data-disposition]','declined');await click('[data-tested]');await submit('[data-form=receive]');await wait("document.querySelector('[data-notice]').textContent.includes('Receipt confirmed')");
 assert.equal(await evaluate("MovementStore.getState().tools.find(t=>t.id==='GRD-002').holder"),'\u2014');assert.equal(calls.length,before,'Damaged demo receipt stays offline');
 await logout();await login('admin');await wait("document.querySelector('.admin-review')");await evaluate('__expire()');await wait("document.querySelector('#auth-email')");assert.equal(await evaluate('MovementStore.getState().tools.length'),0,'Auth events remain connected after restoring and exiting demo');

 await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");
 await logout();
 await require('./workspace-ui-checks.cjs').sync({fixture,evaluate,command,wait,fill,go,login,logout,calls});
 await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");
 await go('dashboard');await wait("document.querySelector('#screen-dashboard.active .overview-kpis')");
 const beforeSetup=calls.length;
 await evaluate("sessionStorage.setItem('mcpa.demo.role','engineer')");
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html?account_setup=invite#type=invite'});
 await wait("document.querySelector('#auth-password')?.getAttribute('autocomplete')==='new-password'");
 assert.equal(await evaluate("document.querySelector('#app-shell').classList.contains('hidden')"),true);
 assert.equal(calls.length,beforeSetup,'Invitation password setup does not load business records');
 await command('Page.reload');await wait("document.querySelector('#auth-password')?.getAttribute('autocomplete')==='new-password'");
 await fill('#auth-password','New-password-2026!');await submit('#auth-form');await wait("document.querySelector('#auth-feedback')?.textContent.includes('Password saved')");
 assert.equal(await evaluate('window.__savedPassword'),'New-password-2026!');
 assert.equal(await evaluate("sessionStorage.getItem('mcpa.password-setup')"),null);
 await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");await evaluate("__authEvent('PASSWORD_RECOVERY')");
 await wait("document.querySelector('#auth-password')?.getAttribute('autocomplete')==='new-password'");await click('[data-auth-logout]');await wait("document.querySelector('#auth-email')");
 await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html?expired_test=1#error=access_denied&error_code=otp_expired'});
 await wait("document.querySelector('#auth-feedback')?.textContent.includes('invalid or expired')");
 await login('sky');await wait("MCPAAuth.profile?.role==='engineer'");await logout();
 assert.deepEqual(errors,[],'No uncaught browser errors');console.log('PASS Account invitation form, onboarding/recovery/expired links, Auth/session, all five roles, direct route guards, review/release/tested receipt/return, damaged demo receipt, theme, mobile, and offline demo isolation');
})().catch(error=>{console.error(error);console.error(JSON.stringify(errors));process.exitCode=1;}).finally(async()=>{socket?.close();chrome?.kill();server.closeAllConnections();server.close();await fixture?.close();console.log('Browser artifacts: '+profile);});
