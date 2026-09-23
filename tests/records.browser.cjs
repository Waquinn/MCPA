// Dashboard, Reports, Users and Purchases browser regressions.
// Purchases runs the existing Consumables setup.sql in isolated PostgreSQL.
// Other directory records are test fixtures. HTTPS is blocked; no live writes.
// Run: node tests/records.browser.cjs (Node 22+, Chrome/Edge, Consumables test deps).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const { database } = require('../modules/consumables/tests/database.cjs');
const workspace = path.resolve(__dirname, '..');
const browser = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => fs.existsSync(file));
assert.ok(browser, 'Set CHROME_PATH to Chrome or Edge.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-records-test-'));
const calls = [];
let testDb, failReads = null, failWrites = null, delay = 0, loseNextReply = false;

const fixture = {
 equipment:[
 {id:'eq-1',asset_id:'EQ-1',name:'<img src=x onerror=alert(1)> Drill',quantity:1,status:'AVAILABLE',site_id:'site-1',category:'Power tools',current_holder_id:null},
 {id:'eq-2',asset_id:'EQ-2',name:'Scaffold',quantity:5,status:'IN_USE',site_id:'site-1',category:'Structure',current_holder_id:'holder-1'},
 {id:'eq-0',asset_id:'EQ-0',name:'Zero count',quantity:0,status:'AVAILABLE',site_id:null}],
 sites:[{id:'site-1',name:'North site',location:'North',status:'active',assigned_engineer:'Test engineer'}],
 profiles:[{id:'holder-1',name:'Test holder',role:'admin'}],
 equipment_transfers:[],equipment_history:[]
};

const sdk = `
window.__timers = new Map();
const originalInterval = window.setInterval, originalClear = window.clearInterval;
window.setInterval = (callback, ms) => { const id = originalInterval(callback, ms); window.__timers.set(id, callback); return id; };
window.clearInterval = id => { window.__timers.delete(id); originalClear(id); };
window.supabase = {createClient() {return {
  rpc(name, parameters) {return fetch('/__db', {method:'POST',body:JSON.stringify({rpc:name,parameters})}).then(r=>r.json());},
  from(table) {
    const query={table}; const builder={
      select() {return this;}, order() {return this;},
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
        assert.ok(['consumables','consumable_requests','consumable_stock_movements',...Object.keys(fixture)].includes(query.table));
        assert.ok(!query.filter || query.filter[0]==='consumable_id');
        const where=query.filter ? ' where consumable_id=$1' : '';
        const values=query.filter ? [query.filter[1]] : [];
        const rows=fixture[query.table] || (await testDb.asRole('anon',`select to_jsonb(t) as value from ${query.table} t${where} order by id`,values)).rows.map(row=>row.value);
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
  await waitFor("document.querySelector('#screen-dashboard.active')");



  const itemId=randomUUID();
  await testDb.rpc('consumables_save_item',{p_id:itemId,p_version:null,p_name:'Fasteners',p_unit:'pieces',p_minimum:5,p_opening:0});
  await check('Dashboard counts real units without treating zero as one', "document.querySelector('#dashboard-kpis').textContent.includes('6') && !document.querySelector('#dashboard-kpis').textContent.includes('126')");
  await evaluate("showScreen('reports')");
  await check('Equipment report resolves stored site and holder IDs', "document.querySelector('#reports-rows').textContent.includes('North site') && document.querySelector('#reports-rows').textContent.includes('Test holder')");
  await check('Database text is escaped', "!document.querySelector('#reports-rows img') && document.querySelector('#reports-rows').textContent.includes('<img')");
  await fill('#reports-search','<img');
  await check('Report filtering matches real records', "document.querySelectorAll('#reports-rows tr').length===1 && document.querySelector('#reports-count').textContent==='1 matching records'");
  await evaluate("window.__exports=[];MCPARecords.download=(name,columns,rows)=>window.__exports.push({name,columns,rows})");
  await click('#screen-reports [data-action=export]');
  await check('CSV export uses matching data', "window.__exports[0].rows.length===1 && window.__exports[0].rows[0][0]==='EQ-1'");
  await check('CSV cells escape formulas and quotes', `MCPARecords.csv(['Value'],[['  =1+1']]).includes("'  =1+1") && MCPARecords.csv(['Value'],[['a"b']]).includes('"a""b"')`);
  await fill('#reports-search','');
  for (const report of ['sites','movement','accountability','missing','repairs','purchases','consumables','equipment']) {
    await click('[data-report="'+report+'"]');
    await check('Report tab '+report+' is functional','document.querySelector("[data-report='+report+']").getAttribute("aria-selected")==="true"');
  }
  await evaluate("showScreen('users')");
  await check('Users show stored profiles and public session honestly', "document.querySelector('#users-rows').textContent.includes('Test holder') && document.querySelector('#users-session').textContent.includes('No authenticated user') && !document.querySelector('#screen-users').textContent.includes('Rowena')");
  await fill('#users-search','no profile');
  await check('User directory search handles empty results', "document.querySelector('#users-count').textContent==='0 profiles'");
  await evaluate("MCPA.session={user:{id:'holder-1',email:'tester@example.test'}};window.dispatchEvent(new Event('mcpa:session'))");
  await waitFor("document.querySelector('#users-session').textContent.includes('tester@example.test')");
  await evaluate("showScreen('purchase')");
  await waitFor("!document.querySelector('#purchase-fields').disabled");
  await fill('#purchase-item',itemId); await fill('#purchase-quantity','5'); await fill('#purchase-requester','Test Buyer'); await fill('#purchase-purpose','Restock test');
  failWrites={code:'42501'};
  await click('#purchase-form [type=submit]');
  await waitFor("document.querySelector('#purchase-status').textContent.includes('permissions')");
  await check('Purchase save errors preserve entered values', "document.querySelector('#purchase-requester').value==='Test Buyer' && !document.querySelector('#purchase-fields').disabled");
  failWrites=null; delay=80;
  const initialWrites=calls.filter(call=>call.rpc==='consumables_create_request').length;
  await evaluate("document.querySelector('#purchase-form').requestSubmit();document.querySelector('#purchase-form').requestSubmit()");
  await waitFor("document.querySelector('#purchase-rows').textContent.includes('CR-00001')");delay=0;
  assert.equal(calls.filter(call=>call.rpc==='consumables_create_request').length,initialWrites+1,'Duplicate submissions blocked');
  const request=(await testDb.db.query('select * from consumable_requests')).rows[0];
  await check('Saved request uses the same reference as Consumables', "document.querySelector('#purchase-rows').textContent.includes('CR-00001') && document.querySelector('#purchase-rows').textContent.includes('5 / 0 pieces')");
  await click('[data-receive="'+request.id+'"]'); await fill('#purchase-receive-quantity','6'); await fill('#purchase-action-note','Delivery 1');
  const beforeInvalid=calls.filter(call=>call.rpc==='consumables_receive_request').length;
  await click('#purchase-action-form [type=submit]');
  await check('Over-receipt is rejected before any write', "document.querySelector('#purchase-receive-quantity').validity.rangeOverflow");
  assert.equal(calls.filter(call=>call.rpc==='consumables_receive_request').length,beforeInvalid);
  await fill('#purchase-receive-quantity','2');loseNextReply=true;
  await click('#purchase-action-form [type=submit]');
  await waitFor("document.querySelector('#purchase-status').textContent.includes('Could not save')");
  await click('#purchase-action-form [type=submit]');
  await waitFor("document.querySelector('#purchase-rows').textContent.includes('Partially received')");
  assert.equal(Number((await testDb.db.query('select current_stock from consumables where id=$1',[itemId])).rows[0].current_stock),2);
  assert.equal((await testDb.db.query("select count(*)::int as count from consumable_stock_movements where kind='receipt'")).rows[0].count,1);
  await check('Lost response retry receives stock once and shows receipt history', "document.querySelector('#purchase-rows').textContent.includes('5 / 2 pieces') && document.querySelector('#purchase-receipts').textContent.includes('Delivery 1')");
  await click('[data-cancel="'+request.id+'"]'); await fill('#purchase-action-note','Remaining order cancelled');await click('#purchase-action-form [type=submit]');
  await waitFor("document.querySelector('#purchase-rows').textContent.includes('Remaining order cancelled')");
  await check('Cancellation retains already received quantities', "document.querySelector('#purchase-rows').textContent.includes('5 / 2 pieces') && document.querySelector('#purchase-rows').textContent.includes('Cancelled')");
  await fill('#purchase-filter','pending');
  await check('Purchase filters show an accurate empty state', "document.querySelector('#purchase-rows').textContent.includes('No matching')");
  await fill('#purchase-filter','cancelled');await click('#screen-purchase [data-action=export]');
  await check('Purchase export retains actual quantities and status', "window.__exports.at(-1).rows[0][3]===2 && window.__exports.at(-1).rows[0][8]==='cancelled'");
  await fill('#purchase-filter','');await fill('#purchase-item',itemId);await fill('#purchase-quantity','1');await fill('#purchase-requester','Buyer 2');await fill('#purchase-purpose','Follow-up');
  await click('#purchase-form [type=submit]');
  await waitFor("document.querySelector('#purchase-rows').textContent.includes('CR-00002')");
  const second=(await testDb.db.query('select * from consumable_requests where request_number=2')).rows[0];
  await click('[data-receive="'+second.id+'"]');await fill('#purchase-action-note','Complete delivery');await click('#purchase-action-form [type=submit]');
  await waitFor("document.querySelector('#purchase-rows').textContent.includes('1 / 1 pieces')");
  assert.equal(Number((await testDb.db.query('select current_stock from consumables where id=$1',[itemId])).rows[0].current_stock),3);
  await check('Full receipt closes request and updates stock atomically', "!document.querySelector('[data-receive=\""+second.id+"\"]')");
  for(let index=0;index<3;index++){
    await evaluate("showScreen('dashboard')");await evaluate("showScreen('purchase')");
    await check('Purchase module revisit '+(index+1)+' reloads saved data',"document.querySelector('#purchase-rows').textContent.includes('CR-00002')");
  }
  failReads={code:'42501'};await click('#screen-purchase [data-action=refresh]');
  await waitFor("document.querySelector('#purchase-status').textContent.includes('Could not load')");
  await check('Failed reads disable purchase writes', "document.querySelector('#purchase-fields').disabled && !document.querySelector('#screen-purchase [data-action=refresh]').disabled");
  failReads=null;await click('#screen-purchase [data-action=refresh]');await waitFor("!document.querySelector('#purchase-fields').disabled");
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const screen of ['dashboard','purchase','reports','users']){
    await evaluate("showScreen('"+screen+"')");
    await check(screen+' fits mobile viewport',"document.documentElement.scrollWidth<=window.innerWidth");
  }
  await command('Page.reload');await waitFor("typeof enterApp==='function'");await evaluate("enterApp()");await evaluate("showScreen('purchase')");
  await check('Browser refresh retains actual purchase database records', "document.querySelector('#purchase-rows').textContent.includes('CR-00002')");
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS Records browser checks with real consumables SQL; no live database writes.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  socket?.close();chrome?.kill();server.closeAllConnections();server.close();await testDb?.db.close();
  console.log('Temporary browser profile: '+profile);
});
