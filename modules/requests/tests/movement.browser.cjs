// Real module + actual setup.sql in local PostgreSQL; only SDK transport is substituted.
// Node 22+ and Chrome/Edge required. No live Supabase access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('../../consumables/tests/node_modules/@electric-sql/pglite');
const siteA=randomUUID(),siteB=randomUUID(),person=randomUUID(),tool=randomUUID(),tool2=randomUUID();
async function database() {
  const db=new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;grant usage on schema public to anon,authenticated;
    create schema auth;create function auth.uid()returns uuid language sql as 'select null::uuid';
    create table profiles(id uuid primary key,name text,role text);
    create table sites(id uuid primary key,name text,location text default 'Test location',assigned_engineer text default 'Test engineer',
      phase text default 'Planning Phase',status text default 'planning',progress integer default 0,last_inventory_check date,
      created_at timestamptz default now(),updated_at timestamptz default now());
    create table equipment(id uuid primary key,asset_id text,name text,status text,condition text default 'Good',quantity integer default 1,
      current_holder_id uuid references profiles(id),site_id uuid references sites(id),brand text,model text,serial_number text,category text,
      tracking_type text default 'Individual',unit text,details text,created_at timestamptz default now());
    create table consumables(id uuid primary key,name text,unit text);
    create table consumable_stock_movements(id uuid primary key,consumable_id uuid references consumables(id),kind text,quantity_change numeric,
      balance_after numeric,note text,created_at timestamptz default now());
    grant select,update on equipment to anon,authenticated;
    grant select on sites,profiles,consumables,consumable_stock_movements to anon,authenticated;`);
  await db.query('insert into sites(id,name) values($1,\'Site A\'),($2,\'Site B\')',[siteA,siteB]);
  await db.query('insert into profiles values($1,\'Person A\',\'admin\')',[person]);
  await db.query("insert into equipment(id,asset_id,name,status,site_id) values($1,'TEST-1','Tool <img src=x onerror=alert(1)>','AVAILABLE',$3),($2,'TEST-2','Tool 2','AVAILABLE',$3)",[tool,tool2,siteA]);
  await db.exec(fs.readFileSync(path.join(__dirname,'../../../database/movement.sql'),'utf8'));
  async function asRole(role,statement,values=[]) {return db.transaction(async tx=>{await tx.exec('set local role '+role);return tx.query(statement,values);});}
  async function rpc(name,params) {
    const signatures={movement_create:['p_id','p_kind','p_equipment_id','p_to_site_id','p_to_user_id','p_notes','p_condition','p_needed_until','p_repair_shop','p_repair_cost'],movement_transition:['p_id','p_version','p_action']};
    const keys=signatures[name];assert.ok(keys,'Known RPC');
    return (await asRole('anon',`select to_jsonb(public.${name}(${keys.map((key,i)=>`${key} => $${i+1}`).join(',')})) as value`,keys.map(key=>params[key]??null))).rows[0].value;
  }
  return {db,asRole,rpc};
}
const workspace = path.resolve(__dirname, '../../..');
const browser = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => fs.existsSync(file));
assert.ok(browser, 'Set CHROME_PATH to Chrome or Edge.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-movement-test-'));
const calls = [];
let testDb, failReads = null, failWrites = null, delay = 0, loseNextReply = false;
const sdk = `
localStorage.setItem('mcpa.preferences',JSON.stringify({defaultScreen:'request'}));
window.__timers = new Map();
const originalInterval = window.setInterval, originalClear = window.clearInterval;
window.setInterval = (callback, ms) => { const id = originalInterval(callback, ms); window.__timers.set(id, callback); return id; };
window.clearInterval = id => { window.__timers.delete(id); originalClear(id); };
window.supabase = {createClient() {return {
  auth:{getSession:async()=>({data:{session:null},error:null}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
  rpc(name, parameters) {return fetch('/__db', {method:'POST',body:JSON.stringify({rpc:name,parameters})}).then(r=>r.json());},
  from(table) {
    const query={table}; const builder={
      select(columns) {query.columns=columns;return this;}, order() {return this;},limit(n){query.end=n-1;return this;},abortSignal(){return this;},
      range(start,end) {query.start=start; query.end=end; return this;},
      eq(column,value) {query.filter=[column,value]; return this;},
      then(resolve,reject) {return fetch('/__db',{method:'POST',body:JSON.stringify(query)}).then(r=>r.json()).then(resolve,reject);}
    }; return builder;
  }
}}};`;
const server = http.createServer(async (request, response) => {
  if (request.url === '/__db') {
    let body=''; for await (const chunk of request) body+=chunk;
    const query=JSON.parse(body); calls.push(query);
    if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
    let data=null, count=null, error=null;
    try {
      if (query.rpc) {
        if (failWrites) throw failWrites;
        data=await testDb.rpc(query.rpc,query.parameters);
        if (loseNextReply) { loseNextReply=false; throw {message:'Simulated lost save response'}; }
      } else {
        if (failReads) throw failReads;
        assert.ok(['equipment','sites','profiles','equipment_transfers','equipment_history','consumables','consumable_stock_movements'].includes(query.table));
        assert.ok(!query.filter || ['id','equipment_id'].includes(query.filter[0]));
        const where=query.filter ? ` where ${query.filter[0]}=$1` : '';
        const values=query.filter ? [query.filter[1]] : [];
        const rows=(await testDb.asRole('anon',`select to_jsonb(t) as value from ${query.table} t${where} order by id`,values)).rows.map(row=>row.value);
        count=rows.length;
        // Small server cap verifies pagination follows returned counts, not requested limits.
        data=rows.slice(query.start||0,Math.min((query.end??499)+1,(query.start||0)+2));
      }
    } catch (err) {error={code:err.code,message:err.message};}
    response.writeHead(200,{'Content-Type':'application/json'}); response.end(JSON.stringify({data,count,error})); return;
  }
  if (request.url==='/__sdk.js') {response.writeHead(200,{'Content-Type':'text/javascript'}); response.end(sdk); return;}
  const file=path.resolve(workspace,'.'+new URL(request.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if (!file.startsWith(workspace+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()) {response.writeHead(404); response.end(); return;}
  let content=fs.readFileSync(file);
  if (file.endsWith('index.html')) content=content.toString().replace(/<script src="https:[^"]+"><\/script>/g,'').replace('</head>','<script src="/__sdk.js"></script></head>');
  response.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(file)]||'text/plain'}); response.end(content);
});

let chrome;
let socket;
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  testDb = await database();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  console.log('Starting isolated browser');
  const base = `http://127.0.0.1:${server.address().port}`;
  chrome = spawn(browser, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = fs.readFileSync(file, 'utf8').split('\n')[0]; break; }
    await pause(100);
  }
  assert.ok(port, 'Browser debugging port did not start.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await Promise.race([once(socket, 'open'), pause(10000).then(() => { throw new Error('Browser socket did not open'); })]);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out: ' + method)); }, 10000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.result.description);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await pause(50); }
    throw new Error('Timed out: ' + expression);
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', {bubbles:true})); field.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  const check = async (name, expression) => { assert.ok(await evaluate(expression), name); console.log('PASS ' + name); };
  const screenshot = async name => {
    await pause(350); // Let the shared screen/theme transitions finish.
    const { data } = await command('Page.captureScreenshot', { format: 'png' });
    const destination = path.join(profile, name + '.png'); fs.writeFileSync(destination, Buffer.from(data, 'base64')); console.log('SCREENSHOT ' + destination);
  };
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Network.enable');
  await command('Network.setBlockedURLs', { urls: ['https://*'] });
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: base });
  await waitFor("typeof enterApp === 'function'");
  await evaluate('enterApp()');
  await waitFor("document.querySelector('#screen-request.active') && !document.querySelector('[data-mv-fields]').disabled");

  async function open(screen) {await evaluate(`showScreen('${screen}')`);await waitFor(`document.querySelector('#screen-${screen}.active') && !document.querySelector('[data-mv-fields]').disabled`);}
  async function ready() {await waitFor("!document.querySelector('[data-mv-fields]').disabled");}
  const save=()=>click('[data-mv-form] [type=submit]');
  async function selectTool(value=tool) {await fill('#mv-equipment',value);await fill('#mv-notes','Real workflow test');}
  async function status(value) {assert.equal((await testDb.db.query('select status from equipment where id=$1',[tool])).rows[0].status,value);}
  await check('Equipment/site/profile dropdowns load real reference rows',"document.querySelector('#mv-equipment').options.length===3 && document.querySelector('#mv-site').options.length===3 && document.querySelector('#mv-holder').options.length===2");
  await check('Database markup is rendered as text',"!document.querySelector('#content img') && document.querySelector('#mv-equipment').textContent.includes('<img')");
  await selectTool();await fill('#mv-site',siteB);await fill('#mv-holder',person);
  failWrites={code:'42501',message:'Denied'};await save();
  await waitFor("document.querySelector('[data-mv-feedback]').textContent.includes('cannot perform')");
  await check('Permission error retains input and allows retry',`document.querySelector('#mv-equipment').value==='${tool}' && !document.querySelector('[data-mv-fields]').disabled`);
  failWrites=null;delay=40;
  const before=calls.filter(x=>x.rpc).length;
  await evaluate("document.querySelector('[data-mv-form]').requestSubmit();document.querySelector('[data-mv-form]').requestSubmit()");
  await waitFor("document.querySelector('[data-action=approve]') && !document.querySelector('[data-mv-fields]').disabled");delay=0;
  assert.equal(calls.filter(x=>x.rpc).length,before+1);
  for(const action of ['approve','release','receive']) {await click(`[data-action=${action}]`);await ready();}
  await status('IN_USE');
  await check('Request approval/release/receipt persists workflow',"document.querySelector('[data-mv-table]').textContent.includes('Completed')");
  console.log('PASS Duplicate submit protection and request transitions using actual SQL');

  await open('transfer');await selectTool();await fill('#mv-site',siteA);await fill('#mv-holder',person);await save();await ready();
  await status('IN_USE');assert.equal((await testDb.db.query('select site_id from equipment where id=$1',[tool])).rows[0].site_id,siteB);
  await click('[data-action=receive]');await ready();assert.equal((await testDb.db.query('select site_id from equipment where id=$1',[tool])).rows[0].site_id,siteA);
  console.log('PASS Transfer changes site only after receipt');

  await open('return');
  await check('Returns exclude Lost and explain where to report missing equipment',"!Array.from(document.querySelector('#mv-condition').options).some(option=>option.value==='Lost') && document.querySelector('#content').textContent.includes('retain its last site and holder')");
  await selectTool();await fill('#mv-site',siteB);await fill('#mv-condition','Damaged');await save();await ready();await status('REPAIR');
  await open('repair');
  await check('Repair history shows its location without implying a transfer',"document.querySelector('[data-mv-table]').textContent.includes('At: Site B') && document.querySelector('[data-mv-table]').textContent.includes('Holder: Unassigned') && !document.querySelector('[data-mv-table]').textContent.includes('→')");
  await click('[data-action=repaired]');await ready();await status('AVAILABLE');
  await open('missing');await selectTool();await save();await ready();await status('MISSING');
  await check('Missing form uses clear action labels',"document.querySelector('.section-title h2').textContent==='Report missing equipment' && document.querySelector('[data-mv-form] [type=submit]').textContent==='Report missing'");
  await check('Missing history retains the last location and holder',"document.querySelector('[data-mv-table]').textContent.includes('At: Site B') && document.querySelector('[data-mv-table]').textContent.includes('Holder: Unassigned') && !document.querySelector('[data-mv-table]').textContent.includes('→')");
  await click('[data-action=found]');await ready();await status('AVAILABLE');
  console.log('PASS Damaged return, automatic repair, repair outcome, missing and recovery');

  for(let repeat=0;repeat<3;repeat++){await open('request');await check('Request data remains after revisit '+repeat,"document.querySelector('[data-mv-table]').textContent.includes('Completed')");await open('missing');}
  await fill('#mv-search','no such tool');await check('Search shows clear empty state',"document.querySelector('[data-mv-table]').textContent.includes('No records match')");await fill('#mv-search','');
  await fill('#mv-filter','active');await check('Status filter excludes closed records',"document.querySelector('[data-mv-table]').textContent.includes('No records match')");await fill('#mv-filter','');
  failReads={code:'PGRST205'};await click('[data-mv=refresh]');await waitFor("document.querySelector('[data-mv-feedback]').textContent.includes('setup is not available')");
  await check('Failed refresh disables stale writes and exposes retry',"document.querySelector('[data-mv-fields]').disabled && !document.querySelector('[data-mv=refresh]').disabled");
  failReads=null;await click('[data-mv=refresh]');await ready();
  delay=70;await evaluate("showScreen('request');showScreen('transfer');showScreen('missing')");await waitFor("document.querySelector('#screen-missing.active') && !document.querySelector('[data-mv-fields]').disabled");delay=0;
  await check('Rapid navigation keeps the latest screen',"document.querySelector('#screen-missing.active') && !document.querySelector('#screen-request')");
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('toggleTheme()');await pause(350);
  await check('Movement mobile layout fits the viewport',"document.documentElement.scrollWidth<=window.innerWidth");
  await screenshot('movement-mobile-dark');
  await command('Page.reload');await waitFor("typeof enterApp==='function'");await evaluate('enterApp()');await ready();
  await check('Request persistence survives page reload',"document.querySelector('[data-mv-table]').textContent.includes('Completed')");

  // Read the same committed SQL history through each newly connected module.
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate("showScreen('activity')");
  await waitFor("document.querySelector('#activity-status')?.textContent==='History updated.'");
  await check('Activity renders committed equipment events with the real tool',"document.querySelector('#activity-rows').textContent.includes('TEST-1') && /MISSING (CREATED|FOUND)/.test(document.querySelector('#activity-rows').textContent)");
  await evaluate("showScreen('sites')");
  await waitFor(`document.querySelector('[data-action="open-site"][data-id="${siteB}"]')`);
  await click(`[data-action="open-site"][data-id="${siteB}"]`);
  await waitFor("document.querySelector('#screen-site-detail.active') && document.querySelector('[data-action=view-movements]')");
  await check('Site inventory reflects received equipment',"document.querySelector('#site-detail-content').textContent.includes('TEST-1')");
  await click('[data-action=view-movements]');
  await waitFor("document.querySelector('#sites-dialog')?.open");
  await check('Site movement dialog renders actual events',"document.querySelector('#sites-dialog').textContent.includes('TEST-1') && !document.querySelector('#sites-dialog').textContent.includes('No movement records available') && document.querySelectorAll('#sites-dialog tbody tr').length>0");
  await click('#sites-dialog [data-action=close-dialog]');
  await evaluate("showScreen('masterlist')");
  await waitFor(`document.querySelector('[data-action="view"][data-id="${tool}"]')`);
  await click(`[data-action="view"][data-id="${tool}"]`);
  await waitFor("document.querySelector('#equipmentHistory .tl-item')");
  await check('Masterlist profile reads the same equipment history',"document.querySelector('#profileContent').textContent.includes('TEST-1') && document.querySelector('#equipmentHistory .tl-title').textContent.length>0");
  assert.deepEqual(errors,[],'No uncaught browser exceptions');
  assert.ok(calls.every(x=>!x.rpc||['movement_create','movement_transition'].includes(x.rpc)));
  console.log('PASS All Movement browser checks; actual local SQL, no live writes');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  socket?.close();chrome?.kill();server.closeAllConnections();server.close();await testDb?.db.close();
  console.log('Temporary browser profile and screenshots: '+profile);
});
