// Dependency-free browser regression check. Node 22+ and Chrome/Edge are required.
// Runs against a local mock database; never calls or changes the Supabase project.
// Usage: node modules/masterlist/tests/masterlist.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const workspace = path.resolve(__dirname, '../../..');
const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(file => fs.existsSync(file));
assert.ok(browser, 'Set CHROME_PATH to a Chrome or Edge executable.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-masterlist-test-'));
const calls = [];
let failure = null;
let delay = 0;
let apiPageLimit = 500;
let serial = 0;
const site = (id, name) => ({ id, name, location: 'Batangas', assigned_engineer: 'Eng. Mark Reyes', phase: 'Structural Phase', status: 'active', progress: 62, last_inventory_check: '2026-08-25', updated_at: '2026-09-01T00:00:00Z' });
const db = {
  sites: [site('casa', 'Casa Buena'), site('empty', 'Empty Site')],
  profiles: [{ id: 'holder-a', name: 'Team A', role: 'admin' }], consumables: [], consumable_requests: [], consumable_stock_movements: [], equipment_history: [], equipment_transfers: [],
  equipment: [
    { id: 'one', category: 'Power Tool', created_at: '2026-09-01T00:00:00Z', asset_id: 'GRD-002', name: 'Grinder', site_id: 'casa', quantity: 1, status: 'AVAILABLE', brand: 'Bosch', tracking_type: 'Individual' },
    { id: 'two', asset_id: 'SCF-010', name: 'Scaffolding Set', site_id: 'casa', quantity: 5, status: 'IN_USE', current_holder_id: 'holder-a', unit: 'Sets' },
    { id: 'three', asset_id: 'CMP-001', name: 'Compressor', site_id: 'casa', quantity: 2, status: 'UNDER_REPAIR' },
    { id: 'zero', asset_id: 'ZERO-1', name: 'Zero stock', site_id: 'casa', quantity: 0, status: 'AVAILABLE' },
    { id: 'unassigned', asset_id: 'U-1', name: 'Unassigned', site_id: null, quantity: 99, status: 'AVAILABLE' }
  ]
};
const sdk = `window.__authListeners=[]; window.supabase = { createClient() { return {
  auth: {
    async getSession() { return {data:{session:JSON.parse(localStorage.getItem('test.session')||'null')},error:null}; },
    onAuthStateChange(callback) {window.__authListeners.push(callback);return {data:{subscription:{unsubscribe(){}}}};},
    async signInWithPassword(values) {
      if(values.email!=='tester@example.test'||values.password!=='correct-password') return {error:{code:'invalid_credentials'}};
      const session={user:{id:'holder-a',email:values.email,user_metadata:{}}}; localStorage.setItem('test.session',JSON.stringify(session)); return {data:{session},error:null};
    },
    async signOut() { localStorage.removeItem('test.session');window.__authListeners.forEach(fn=>fn('SIGNED_OUT',null));return {error:null}; }
  },
  rpc(name,parameters) {return fetch('/__db',{method:'POST',body:JSON.stringify({rpc:name,parameters})}).then(r=>r.json());},
  from(table) {
  const query = { table, method: 'read', filters: [] };
  const builder = {
    select(columns, options) { query.columns = columns; query.count = options?.count; return this; },
    order(column) { query.order = column; return this; },
    range(from, to) { query.range = [from, to]; return this; },
    limit(value) { query.limit = value; return this; },
    eq(column, value) { query.filters.push([column, value]); return this; },
    is(column, value) { query.filters.push([column, value, 'is']); return this; },
    in(column, values) { query.filters.push([column, values, 'in']); return this; },
    insert(values) { query.method = 'insert'; query.values = values; return this; },
    update(values) { query.method = 'update'; query.values = values; return this; },
    delete() { query.method = 'delete'; return this; },
    then(resolve, reject) { return fetch('/__db', {method: 'POST', body: JSON.stringify(query)}).then(r => r.json()).then(resolve, reject); }
  }; return builder;
} }; } };`;

const server = http.createServer(async (request, response) => {
  if (request.url === '/__db') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const query = JSON.parse(body);
    calls.push(query);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if(query.rpc) {
      if(query.rpc==='settings_update_profile') {
        db.profiles[0].name=query.parameters.p_name;
        response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({data:{...db.profiles[0]},error:null}));return;
      }
      response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({data:null,error:{code:'PGRST202'}}));return;
    }
    let data = null;
    let count = null;
    let error = failure;
    if (!error) {
      let rows = (db[query.table] || []).filter(row => query.filters.every(([key, value, mode]) => mode === 'in' ? value.includes(row[key]) : mode === 'is' ? row[key] == value : row[key] === value));
      if (query.method === 'read') {
        rows = [...rows].sort((a, b) => String(a[query.order]).localeCompare(String(b[query.order])));
        if (query.count === 'exact') count = rows.length;
        if (query.range) rows = rows.slice(query.range[0], Math.min(query.range[1] + 1, query.range[0] + apiPageLimit));
        if (query.limit) rows = rows.slice(0, query.limit);
        data = rows;
      } else if (query.method === 'insert') {
        const row = { ...(Array.isArray(query.values) ? query.values[0] : query.values), id: 'new-' + ++serial, updated_at: new Date().toISOString() };
        db[query.table].push(row); data = [row];
      } else if (query.method === 'update') {
        rows.forEach(row => Object.assign(row, query.values, { updated_at: new Date().toISOString() })); data = rows;
      } else if (query.method === 'delete') {
        if (rows.some(row => db.equipment.some(item => item.site_id === row.id))) error = { code: '23503' };
        else { db[query.table] = db[query.table].filter(row => !rows.includes(row)); data = rows; }
      }
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data, count, error }));
    return;
  }
  if (request.url === '/__sdk.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(sdk); return;
  }
  if (request.url.startsWith('/modules/') && request.url.endsWith('.html') && delay) await new Promise(resolve => setTimeout(resolve, delay));
  const file = path.resolve(workspace, '.' + new URL(request.url, 'http://localhost').pathname.replace(/^\/$/, '/index.html'));
  if (!file.startsWith(workspace + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); response.end(); return; }
  let content = fs.readFileSync(file);
  if (file.endsWith('index.html')) {
    content = content.toString().replace(/<script src="https:[^"]+"><\/script>/g, '').replace('</head>', '<script src="/__sdk.js"></script></head>');
  }
  response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'text/plain' });
  response.end(content);
});

let chrome;
let socket;
const errors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
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

  db.equipment.forEach(row => Object.assign(row, { category: row.category || 'Hand Tools', condition: 'Good', tracking_type: row.quantity > 1 ? 'Bulk' : 'Individual', unit: row.quantity > 1 ? 'Pieces' : null }));
  db.equipment[0].serial_number = 'SERIAL-UNIQUE';
  db.equipment[0].category = 'Tools <special> "quoted"';
  await evaluate("showScreen('masterlist')");
  await check('Initial load reads equipment and site names', "document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 5 && document.querySelector('#equipmentTableBody').textContent.includes('Casa Buena') && document.querySelector('#equipmentTableBody').textContent.includes('Unassigned')");
  for (let index = 0; index < 3; index++) {
    await evaluate("showScreen('sites')"); await evaluate("showScreen('masterlist')");
    await check('Equipment reloads on revisit ' + (index + 1), "document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 5");
  }
  await fill('#searchEquipment', 'SERIAL-UNIQUE');
  await check('Search includes serial number', "document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 1 && document.querySelector('#equipmentTableBody').textContent.includes('Grinder')");
  await fill('#searchEquipment', ''); await fill('#statusFilter', 'REPAIR');
  await check('For Repair filter recognizes existing status aliases', "document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 1 && document.querySelector('#equipmentTableBody').textContent.includes('Compressor')");
  await fill('#statusFilter', ''); await fill('#siteFilter', '__unassigned__');
  await check('Unassigned is an actual filter, with no fabricated site', "document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 1 && document.querySelector('#equipmentTableBody').textContent.includes('U-1')");
  await fill('#siteFilter', ''); await fill('#typeFilter', db.equipment[0].category);
  await check('Categories with markup/quotes remain selectable and escaped', "document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 1 && !document.querySelector('#equipmentTableBody special')");
  await fill('#typeFilter', '');
  db.equipment_history.push({id:'history-one',equipment_id:'one',action:'Transferred safely <not markup>',created_at:'2026-09-23T00:00:00Z'});
  await click('[data-action=view][data-id=one]');
  await waitFor("document.querySelector('#equipmentHistory').textContent.includes('Transferred safely')");
  await check('Tool profile reads actual equipment history and escapes it', "document.querySelector('#equipmentHistory').textContent.includes('<not markup>') && !document.querySelector('#equipmentHistory not')");
  await click('[data-action=back]');
  db.sites.push(site('fresh', 'Fresh Site'));
  await click('[data-action=edit][data-id=one]');
  await waitFor("!document.querySelector('#modalSubmitBtn').disabled");
  await check('Edit restores category and site, refreshes newly added sites', "document.querySelector('#equipmentSite').value === 'casa' && document.querySelector('#equipmentCategory').value.includes('<special>') && [...document.querySelector('#equipmentSite').options].some(option => option.value === 'fresh')");
  await fill('#equipmentSite', 'fresh'); await fill('#equipmentCategory', 'Hand Tools');
  await click('#modalSubmitBtn');
  await waitFor("document.querySelector('#equipmentModal').style.display === 'none' && document.querySelector('#masterlistFeedback').textContent === 'Item updated.'");
  assert.equal(db.equipment.find(row => row.id === 'one').site_id, 'fresh');
  assert.equal(db.equipment.find(row => row.id === 'one').category, 'Hand Tools');
  assert.ok(!Object.hasOwn(db.equipment[0], 'site'), 'Only site_id is stored');
  console.log('PASS Equipment update persists proper site ID and category');
  await click('[data-action=edit][data-id=one]'); await waitFor("!document.querySelector('#modalSubmitBtn').disabled");
  db.equipment.find(row => row.id === 'one').site_id = 'empty';
  await fill('#equipmentType', 'Stale editor'); await click('#modalSubmitBtn');
  await waitFor("document.querySelector('#equipmentFormFeedback').textContent.includes('changed or is no longer available')");
  assert.equal(db.equipment.find(row => row.id === 'one').site_id, 'empty'); assert.equal(db.equipment.find(row => row.id === 'one').name, 'Grinder');
  console.log('PASS Stale editor cannot overwrite a completed movement');
  await click('#cancelEquipmentModal'); await click('#refreshMasterlist'); await waitFor("document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 5");
  await click('#openAddEquipment'); await waitFor("!document.querySelector('#modalSubmitBtn').disabled");
  await fill('#equipmentType', 'Test tool'); await fill('#equipmentCategory', '__new__'); await fill('#newEquipmentCategory', '  Custom   category  ');
  await fill('#trackingType', 'Bulk'); await fill('#equipmentQuantity', '0'); await fill('#equipmentUnit', 'Pieces'); await fill('#equipmentSite', 'fresh');
  const insertsBefore = calls.filter(query => query.method === 'insert').length;
  await evaluate("document.querySelector('#equipmentForm').requestSubmit(); document.querySelector('#equipmentForm').requestSubmit()");
  await waitFor("document.querySelector('#equipmentModal').style.display === 'none' && document.querySelector('#masterlistFeedback').textContent === 'Item registered.'");
  assert.equal(calls.filter(query => query.method === 'insert').length, insertsBefore + 1);
  const created = db.equipment.find(row => row.name === 'Test tool');
  assert.equal(created.category, 'Custom category'); assert.equal(created.quantity, 0); assert.equal(created.site_id, 'fresh');
  assert.match(created.asset_id, /^T-[A-F0-9-]{36}$/);
  console.log('PASS Create saves normalized dynamic category, zero quantity, UUID asset ID; double submit writes once');
  await click(`[data-action=edit][data-id="${created.id}"]`); await waitFor("!document.querySelector('#modalSubmitBtn').disabled");
  await check('Editing zero stock preserves zero and dynamic category', "document.querySelector('#equipmentQuantity').value === '0' && document.querySelector('#equipmentCategory').value === 'Custom category'");
  await click('#cancelEquipmentModal');
  await click('.row-checkbox[value=one]'); await click('.row-checkbox[value=two]');
  await click('#btnBulkStatus'); await fill('#bulkStatusSelect', 'IN_USE'); await click('#bulkModalSubmitBtn');
  await waitFor("document.querySelector('#masterlistFeedback').textContent === '2 items updated.'");
  assert.equal(db.equipment.find(row => row.id === 'one').status, 'IN_USE');
  console.log('PASS Bulk status persists valid canonical status');
  await click('.row-checkbox[value=one]'); await click('#btnBulkLocation'); await waitFor("!document.querySelector('#bulkModalSubmitBtn').disabled");
  await fill('#bulkLocationInput', 'empty'); await click('#bulkModalSubmitBtn'); await waitFor("document.querySelector('#masterlistFeedback').textContent === '1 items updated.'");
  assert.equal(db.equipment.find(row => row.id === 'one').site_id, 'empty');
  console.log('PASS Bulk location uses existing site IDs');
  await evaluate('window.confirm = () => true'); await click(`[data-action=delete][data-id="${created.id}"]`);
  await waitFor("document.querySelector('#masterlistFeedback').textContent === 'Item deleted.'");
  assert.ok(!db.equipment.some(row => row.id === created.id)); console.log('PASS Delete persists');
  for (let index = 0; index < 22; index++) db.equipment.push({ id: 'page-' + index, asset_id: 'PAGE-' + index, name: 'Paged tool', category: 'Hand Tools', status: 'AVAILABLE', quantity: 1 });
  apiPageLimit = 3; await click('#refreshMasterlist'); await waitFor("document.querySelector('#paginationInfo').textContent.includes('of 27 entries')");
  await check('Reads all API pages despite server cap and paginates display', "document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 10");
  await click('[data-action=page][data-id="2"]');
  await check('Next page changes range', "document.querySelector('#paginationInfo').textContent.includes('11–20')");
  await evaluate("MCPA.savePreferences({pageSize:25}); filterMasterlist()");
  await check('Saved page size affects Masterlist', "document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 25");
  failure = {code:'NETWORK',message:'private technical details'};
  await click('#refreshMasterlist'); await waitFor("document.querySelector('#masterlistFeedback').classList.contains('is-error')");
  await check('Failed read shows retry feedback without leaking details', "document.querySelector('#equipmentTableBody').textContent.includes('Refresh') && !document.body.textContent.includes('private technical details')");
  failure = null; await click('#refreshMasterlist'); await waitFor("document.querySelectorAll('#equipmentTableBody .row-checkbox').length === 25");
  failure = {code:'40001'};
  await click('.row-checkbox[value=one]'); await click('#btnBulkStatus'); await fill('#bulkStatusSelect', 'MISSING'); await click('#bulkModalSubmitBtn');
  await waitFor("document.querySelector('#bulkFormFeedback').textContent.includes('active movement')");
  console.log('PASS Movement conflict leaves bulk dialog open with actionable error');
  failure = null; await click('#cancelBulkModal');
  await command('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await check('Mobile page does not overflow viewport', "document.documentElement.scrollWidth <= 390");
  await screenshot('masterlist-mobile');
  await evaluate("window.open = () => null"); await click('#exportBtn');
  await check('Blocked export popup gives feedback', "document.querySelector('#masterlistFeedback').textContent.includes('pop-ups')");
  delay = 200; await evaluate("showScreen('sites'); showScreen('masterlist'); showScreen('settings')");
  await waitFor("document.querySelector('#screen-settings.active')"); await pause(1000);
  await check('Stale module responses do not overwrite final navigation', "!!document.querySelector('#screen-settings.active') && !document.querySelector('#equipmentTableBody')");
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('PASS All Masterlist regression checks; no live database writes.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close(); chrome?.kill(); server.closeAllConnections(); server.close();
  console.log('Temporary browser profile and screenshots: ' + profile);
});
