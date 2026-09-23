// Dependency-free browser regression check. Node 22+ and Chrome/Edge are required.
// Runs against a local mock database; never calls or changes the Supabase project.
// Usage: node tests/system.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const workspace = path.resolve(__dirname, '..');
const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(file => fs.existsSync(file));
assert.ok(browser, 'Set CHROME_PATH to a Chrome or Edge executable.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpa-system-test-'));
const calls = [];
let failure = null;
let delay = 0;
let apiPageLimit = 500;
let omitCount = false;
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
    async getSession() { const session=JSON.parse(localStorage.getItem('test.session')||'null'); const delay=Number(sessionStorage.getItem('test.restoreDelay')||0);sessionStorage.removeItem('test.restoreDelay'); if(delay) await new Promise(resolve=>setTimeout(resolve,delay)); return {data:{session},error:null}; },
    onAuthStateChange(callback) {window.__authListeners.push(callback);return {data:{subscription:{unsubscribe(){}}}};},
    async signInWithPassword(values) {
      if(window.__signInDelay) await new Promise(resolve=>setTimeout(resolve,window.__signInDelay));
      if(values.email!=='tester@example.test'||values.password!=='correct-password') return {error:{code:'invalid_credentials'}};
      const session={user:{id:'holder-a',email:values.email,user_metadata:{}}}; localStorage.setItem('test.session',JSON.stringify(session));window.__authListeners.forEach(fn=>fn('SIGNED_IN',session)); return {data:{session},error:null};
    },
    async signOut() { if(window.__signOutDelay) await new Promise(resolve=>setTimeout(resolve,window.__signOutDelay)); localStorage.removeItem('test.session');window.__authListeners.forEach(fn=>fn('SIGNED_OUT',null));return {error:null}; }
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
        if (query.count === 'exact' && !omitCount) count = rows.length;
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
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out: ' + method)); }, 30000);
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
  await evaluate("showScreen('settings')");
  await waitFor("document.querySelector('#settings-theme')");
  await check('Prototype account is clearly identified', "document.querySelector('#settings-profile').textContent.includes('public prototype')");
  await check('Settings uses established display and body typography', "getComputedStyle(document.querySelector('#screen-settings h1')).fontFamily.includes('Fraunces') && getComputedStyle(document.querySelector('#screen-settings .section-title h2')).fontFamily.includes('Fraunces') && getComputedStyle(document.querySelector('#settings-profile')).fontFamily.includes('Public Sans') && getComputedStyle(document.querySelector('#settings-theme')).fontFamily.includes('Public Sans') && getComputedStyle(document.querySelector('#settings-preferences button')).fontFamily.includes('Public Sans')");
  await fill('#settings-theme', 'dark');
  await fill('#settings-page-size', '25');
  await fill('#settings-start', 'masterlist');
  await click('#settings-preferences [type=submit]');
  await check('Preferences persist and apply to the page', "document.body.classList.contains('dark') && JSON.parse(localStorage.getItem('mcpa.preferences')).pageSize === 25 && document.querySelector('#settings-feedback').textContent.includes('saved')");
  await evaluate("showScreen('sites')");
  await evaluate("showScreen('settings')");
  await check('Settings reload saved values after navigation', "document.querySelector('#settings-theme').value === 'dark' && document.querySelector('#settings-page-size').value === '25'");
  await click('#settings-reset');
  await check('Restore Defaults persists and applies', "!document.body.classList.contains('dark') && MCPA.getPreferences().defaultScreen === 'dashboard'");
  await evaluate('logoutApp()');
  await fill('#login-email', 'tester@example.test'); await fill('#login-password', 'wrong-password');
  await click('#login-submit');
  await waitFor("document.querySelector('#login-feedback').textContent.includes('failed')");
  await check('Invalid login keeps workspace closed', "document.querySelector('#app-shell').classList.contains('hidden')");
  await fill('#login-password', 'correct-password'); await click('#login-submit');
  await waitFor("document.querySelector('#screen-dashboard.active')");
  await evaluate("showScreen('settings')");
  await waitFor("document.querySelector('#settings-name')");
  await fill('#settings-name', 'Updated Tester'); await click('#settings-profile-form [type=submit]');
  await waitFor("document.querySelector('#settings-feedback').textContent.includes('Profile saved')");
  await check('Profile save writes existing account and updates shell', "document.querySelector('.sidebar-foot .name').textContent === 'Updated Tester'");
  await command('Page.reload');
  await waitFor("document.querySelector('#screen-dashboard.active')");
  await evaluate("showScreen('settings')");
  await check('Session and profile persist after refresh', "MCPA.session.user.id === 'holder-a' && document.querySelector('#settings-name').value === 'Updated Tester'");
  db.profiles.push({id:'holder-b',name:'Second Account',role:'engineer'});
  await evaluate("window.__authListeners.forEach(fn=>fn('SIGNED_IN',{user:{id:'holder-b',email:'second@example.test',user_metadata:{}}}))");
  await waitFor("document.querySelector('#screen-dashboard.active') && document.querySelector('.sidebar-foot .name').textContent === 'Second Account'");
  await evaluate("showScreen('settings')");
  await check('An account change clears the previous profile and remounts account forms', "document.querySelector('#settings-name').value === 'Second Account' && document.querySelector('#settings-email').value === 'second@example.test'");
  await evaluate("window.__authListeners.forEach(fn=>fn('SIGNED_IN',{user:{id:'holder-a',email:'tester@example.test',user_metadata:{}}}))");
  await waitFor("document.querySelector('#screen-dashboard.active') && document.querySelector('.sidebar-foot .name').textContent === 'Updated Tester'");
  delay = 100;
  await evaluate("showScreen('masterlist');showScreen('settings');showScreen('sites');");
  await waitFor("document.querySelector('#screen-sites.active') && document.querySelectorAll('.site-card').length === 2");
  await pause(400);
  await check('Newest navigation wins during overlapping requests', "document.querySelector('#screen-sites.active') && currentModule === 'sites'");
  delay = 0;
  await evaluate("globalSearch('Grinder'); showScreen('settings')"); await pause(350);
  await check('Explicit navigation cancels an older debounced search', "!!document.querySelector('#screen-settings.active') && currentModule === 'settings'");
  for (const screen of ['masterlist','request','transfer','return','repair','missing','purchase','reports','activity','users','consumables','sites','settings','dashboard','masterlist']) {
    await evaluate(`showScreen(${JSON.stringify(screen)})`);
    await check('Opens ' + screen, `!!document.querySelector('#screen-${screen}.active')`);
  }
  await evaluate("showToolProfile('one')");
  await check('Equipment profile opens visibly', "getComputedStyle(document.querySelector('#screen-tool-profile')).display !== 'none'");
  await evaluate("showScreen('masterlist')");
  await check('Same-module navigation restores visible Masterlist from profile', "getComputedStyle(document.querySelector('#screen-masterlist')).display !== 'none' && getComputedStyle(document.querySelector('#screen-tool-profile')).display === 'none'");
  await evaluate('initMasterlist()');
  await check('Refreshing after profile return stays on Masterlist', "getComputedStyle(document.querySelector('#screen-tool-profile')).display === 'none'");
  apiPageLimit = 2; omitCount = true;
  await check('Shared reads continue through capped responses without count metadata', '(async () => (await MCPA.readAll("equipment")).length === 5)()');
  apiPageLimit = 500; omitCount = false;
  await evaluate("showScreen('dashboard')");
  await evaluate("window.__settingsInit=MCPAModules.settings.init; MCPAModules.settings.init=()=>new Promise((resolve,reject)=>{window.__rejectMount=reject}); void showScreen('settings')");
  await waitFor('typeof window.__rejectMount === "function"');
  await evaluate("showScreen('settings'); window.__rejectMount(new Error('Injected initializer failure'))");
  await waitFor("document.querySelector('#retry-module')");
  await check('Repeated navigation during failed init renders retry instead of uncaught rejection', "document.querySelector('#content').textContent.includes('Unable to open this page')");
  await evaluate('MCPAModules.settings.init=window.__settingsInit'); await click('#retry-module');
  await waitFor("document.querySelector('#settings-theme')");
  await command('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate("showScreen('settings')");
  await check('Settings fits a mobile viewport', 'document.documentElement.scrollWidth <= innerWidth');
  await screenshot('system-settings-mobile');
  await evaluate('logoutApp()');
  await command('Page.reload');
  await waitFor("typeof enterApp === 'function'");
  await check('Sign out clears restored session', "document.querySelector('#app-shell').classList.contains('hidden') && !MCPA.session && !sessionStorage.getItem('mcpa.prototype')");
  await evaluate('window.__signInDelay=300');
  await fill('#login-email', 'tester@example.test'); await fill('#login-password', 'correct-password');
  await click('#login-submit'); await evaluate('enterApp()'); await pause(500);
  await check('Late SIGNED_IN and password response preserve an explicit prototype choice', "MCPA.prototype && !MCPA.session && !localStorage.getItem('test.session') && !document.querySelector('#app-shell').classList.contains('hidden')");
  await evaluate('logoutApp()');
  await fill('#login-email', 'tester@example.test'); await fill('#login-password', 'correct-password');
  await click('#login-submit'); await evaluate('logoutApp()'); await pause(500);
  await check('Signing out during pending password auth cannot reopen the workspace', "!MCPA.session && !localStorage.getItem('test.session') && document.querySelector('#app-shell').classList.contains('hidden')");
  await evaluate('window.__signInDelay=0');
  await fill('#login-password', 'correct-password'); await click('#login-submit'); await waitFor("document.querySelector('#screen-dashboard.active')");
  await evaluate('window.__signOutDelay=300; logoutApp(); enterApp()'); await pause(500);
  await check('Late sign-out completion cannot close a newly chosen prototype workspace', "MCPA.prototype && !MCPA.session && !document.querySelector('#app-shell').classList.contains('hidden')");
  await evaluate("localStorage.setItem('test.session',JSON.stringify({user:{id:'holder-a',email:'tester@example.test',user_metadata:{}}}));sessionStorage.setItem('test.restoreDelay','500')");
  await command('Page.reload'); await waitFor("typeof enterApp === 'function'"); await evaluate('enterApp()'); await pause(700);
  await check('Delayed restoration cannot replace an explicit prototype session', "MCPA.prototype && !MCPA.session && !localStorage.getItem('test.session') && !document.querySelector('#app-shell').classList.contains('hidden')");
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('PASS All system browser checks; no live database writes.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  socket?.close(); chrome?.kill(); server.closeAllConnections(); server.close();
  console.log('Temporary browser profile and screenshots: ' + profile);
});
