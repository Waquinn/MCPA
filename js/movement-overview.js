/* Read-only views of the same records used by movement forms. */
(function () {
  'use strict';
  let root, screen, controller, query = '', status = '', mine = false, site = '', inventory = null, stopWatching;
  let loading = false, reloadPending = false;
  const viewData = () => ({...store().getState(), ...(inventory || {})});
  const store = () => window.MovementStore;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const when = value => value ? new Date(value).toLocaleString('en-PH', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila'}) : '—';
  const badge = value => `<span class="badge badge-${['available', 'inuse', 'repair', 'underrepair', 'missing'].includes(value) ? value : 'pending'}">${escape(typeof STATUS_LABEL !== 'undefined' ? STATUS_LABEL[value] || value : value)}</span>`;
  const button = (label, target) => `<button class="btn btn-secondary btn-sm" data-go="${target}">${label}</button>`;
  function contextBar() {
    const target = document.getElementById('movement-context');
    if (!target) return;
    let data, user;
    try { data = store().getState(); user = store().getContext(); } catch (_) { return; }
    const other = user.role === 'engineer' ? '../index.html#request' : '2-engr/index.html';
    target.innerHTML = `<div class="movement-context-inner"><span class="movement-source">${store().mode === 'demo' ? 'Demo · saved in this browser' : 'Live database'}</span>${store().mode === 'live' ? `<label>Acting profile <select id="movement-profile" aria-label="Acting profile"><option value="">Choose your profile</option>${data.users.map(p => `<option value="${escape(p.id)}" ${p.id === user.id ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}</select></label>` : `<span>${escape(user.name)}</span>`}<a class="link-btn" href="${other}">Open ${user.role === 'engineer' ? 'Admin review' : 'Engineer portal'} ↗</a></div>`;
    target.querySelector('select')?.addEventListener('change', event => {
      if (!event.target.value) return;
      store().setContext(event.target.value);
    });
    const name = document.querySelector('.sidebar-foot .name');
    if (name) name.textContent = user.name || 'Choose profile';
    const dot = document.querySelector('.bell-dot');
    if (dot) dot.classList.toggle('hidden', !(data.requests.some(r => r.status === 'pending') || data.transfers.some(t => t.status === 'pending' && t.receiver === user.name)));
  }
  function header(title, sub) {
    return `<div class="page-head"><div><h1 class="display">${escape(title)}</h1><p class="sub">${escape(sub)}</p></div><div class="page-head-actions"><select aria-label="Data source" data-mode><option value="live" ${store().mode === 'live' ? 'selected' : ''}>Live database</option><option value="demo" ${store().mode === 'demo' ? 'selected' : ''}>Demo data</option></select><span class="inventory-sync" role="status">${store().mode === 'live' ? 'Updates automatically' : 'Demo data'}</span></div></div><div id="overview-feedback" role="status"></div>`;
  }
  function toolsTable(tools) {
    if (!tools.length) return '<div class="empty-state"><h3>No tools to show</h3><p>Request an available tool, or change the filters.</p></div>';
    return `<div class="table-wrap"><table><thead><tr><th>Equipment</th><th>Project</th><th>Holder</th><th>Condition / availability</th><th>Quantity</th><th></th></tr></thead><tbody>${tools.map(t => `<tr><td><div class="equipment-identity">${window.EquipmentVisual.thumbnail(t)}<div><span class="tool-id-chip">${escape(t.id)}</span><div class="cell-name">${escape(t.name)}</div><div class="cell-sub">${escape(t.brand)}</div></div></div></td><td>${escape(t.site || 'Unassigned')}</td><td>${escape(t.holder || '—')}</td><td>${badge(t.status)}<div class="cell-sub">${escape(window.EquipmentTracking.availability(t))}</div></td><td>${escape(t.qty)}</td><td><button class="btn btn-secondary btn-sm" data-tool="${escape(t.id)}">Details</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function activityTable(rows) {
    if (!rows.length) return '<div class="empty-state"><h3>No recorded movement yet</h3><p>Saved requests, handovers, returns, and issues will appear here.</p></div>';
    return `<div class="table-wrap"><table><thead><tr><th>When · Manila</th><th>Action / reference</th><th>Recorded by</th><th>Details</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escape(when(r.createdAt))}</td><td><div class="cell-name">${escape(r.action)}</div><span class="mono">${escape(r.entityId)}</span></td><td>${escape(r.actor)}</td><td>${escape(r.summary)}<div class="cell-sub">${escape((r.toolIds || []).join(', '))}</div></td></tr>`).join('')}</tbody></table></div>`;
  }
  function visibleActivity(data) {
    return [...data.activity].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).filter(r => [r.action, r.entityId, r.actor, r.summary, ...(r.toolIds || [])].join(' ').toLowerCase().includes(query.toLowerCase()));
  }
  function dashboard(data, user) {
    const admin = user.role === 'admin';
    const assigned = admin ? data.tools : data.tools.filter(t => t.holder === user.name);
    const incoming = data.transfers.filter(t => t.status === 'pending' && (admin || t.receiver === user.name));
    const requests = data.requests.filter(r => ['pending', 'approved'].includes(r.status) && (admin || r.requester === user.name));
    const issueTools = assigned.filter(t => ['repair', 'underrepair', 'missing'].includes(t.status));
    const totals = window.EquipmentTracking.tally(assigned);
    const cards = [[totals.total, 'Total Equipments', 'masterlist'], [totals.available, 'Available', 'masterlist'], [totals.deployed, 'Deployed', 'masterlist'], [(data.activeProjects || data.sites.filter(s => s.is_active !== false && !s.archived_at)).length, 'Active Projects', 'sites']];
    return `${header(admin ? 'Movement overview' : `Welcome back${user.name ? ', ' + user.name : ''}`, 'Requests, custody, and tool condition from your saved records.')}<div class="overview-actions">${button('+ Request tools', 'request')}${button('Receive / transfer', 'transfer')}${button('Return tools', 'return')}${button('Report an issue', 'repair')}</div><div class="grid grid-4 overview-kpis">${cards.map(([count,label,go]) => `<button class="card kpi" data-go="${go}"><span class="num">${count}</span><span class="lbl">${label}</span></button>`).join('')}</div><div class="overview-columns"><section><div class="section-title"><h2>${admin ? 'Current inventory' : 'My assigned tools'}</h2>${button('View inventory', 'masterlist')}</div><div class="card">${toolsTable(assigned.slice(0,6))}</div></section><section><div class="section-title"><h2>Next actions</h2></div><div class="card card-pad"><div class="overview-task"><div><strong>${incoming.length} transfer${incoming.length === 1 ? '' : 's'} awaiting receipt</strong><p>Inspect each tool before accepting custody.</p></div>${button('Open', 'transfer')}</div><div class="overview-task"><div><strong>${requests.length} open request${requests.length === 1 ? '' : 's'}</strong><p>${admin ? 'Review availability and release approved tools.' : 'Track approval and release by the Admin.'}</p></div>${button('Open', 'request')}</div><div class="overview-task"><div><strong>Accountability follows confirmation</strong><p>Requests and pending transfers do not change the current holder.</p></div></div></div></section></div><div class="section-title"><h2>Recent movement</h2>${button('View activity', 'activity')}</div><div class="card">${activityTable(visibleActivity(data).slice(0,6))}</div>`;
  }
  function render() {
    if (!root?.isConnected) return;
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const focusId = focused?.id, selectionStart = focused?.selectionStart, selectionEnd = focused?.selectionEnd;
    const data = viewData(), user = store().getContext();
    contextBar();
    if (screen === 'dashboard') root.innerHTML = dashboard(data,user);
    else if (screen === 'activity') root.innerHTML = `${header('Activity logs', 'A history of saved movement actions and the people who recorded them.')}<div class="overview-filters"><div class="field"><label for="movement-activity-search">Search activity</label><input id="movement-activity-search" data-search value="${escape(query)}" placeholder="Reference, tool ID, person, action…"></div><button class="btn btn-secondary" data-export>Export CSV</button></div><div class="card" id="overview-results">${activityTable(visibleActivity(data))}</div>`;
    else root.innerHTML = `${header('Equipment Tracking', 'Current location, condition, and custody. Open a tool to see its recorded history.')}<div class="overview-filters"><div class="field"><label for="movement-inventory-search">Search tools</label><input id="movement-inventory-search" data-search value="${escape(query)}" placeholder="Tool ID, name, brand, holder…"></div><div class="field"><label for="overview-status">Status</label><select id="overview-status"><option value="">All statuses</option>${Object.entries(STATUS_LABEL).map(([key,label]) => `<option value="${key}" ${status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label for="overview-site">Project</label><select id="overview-site"><option value="">All projects</option>${data.sites.map(s => `<option ${site === s.name ? 'selected' : ''}>${escape(s.name)}</option>`).join('')}</select></div><label class="checkbox-row"><input type="checkbox" id="overview-mine" ${mine ? 'checked' : ''}>My custody only</label></div><div class="card" id="overview-results"></div>`;
    if (screen === 'masterlist') filter();
    if (screen === 'dashboard') {
      const projects = data.activeProjects || data.sites.filter(s => s.is_active !== false && !s.archived_at);
      root.insertAdjacentHTML('beforeend', `<section class="dashboard-projects"><div class="section-title"><h2>Active Projects</h2>${button('View projects', 'sites')}</div><div class="card">${projects.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Equipment tally</th><th>Total Equipments</th></tr></thead><tbody>${projects.map(project => {
        const tools = data.tools.filter(tool => (tool.site_id === project.id || tool.siteId === project.id || tool.site === project.name) && window.EquipmentTracking.quantity(tool) > 0);
        const groups = new Map();
        tools.forEach(tool => groups.set(tool.name, (groups.get(tool.name) || 0) + window.EquipmentTracking.quantity(tool)));
        return `<tr><td class="cell-name">${escape(project.name)}</td><td>${[...groups].filter(([, count]) => count > 0).map(([name, count]) => `${escape(name)}: ${count}`).join(' · ') || 'No equipment assigned'}</td><td>${window.EquipmentTracking.tally(tools).total}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty-state">No active projects.</div>'}</div></section>`);
    }
    if (focusId) {
      const replacement = document.getElementById(focusId);
      replacement?.focus({preventScroll: true});
      if (typeof selectionStart === 'number') replacement?.setSelectionRange?.(selectionStart, selectionEnd);
    }
  }
  function filter() {
    const data = viewData(), user = store().getContext();
    const results = root.querySelector('#overview-results');
    if (!results) return;
    if (screen === 'activity') results.innerHTML = activityTable(visibleActivity(data));
    else results.innerHTML = toolsTable(data.tools.filter(t => window.EquipmentTracking.matchesStatus(t, status) && (!site || t.site === site) && (!mine || t.holder === user.name) && [t.id,t.name,t.brand,t.site,t.holder,t.serial].join(' ').toLowerCase().includes(query.toLowerCase())));
  }
  function detail(id) {
    const data = viewData(), item = data.tools.find(t => t.id === id);
    if (!item) return;
    root.querySelector('dialog')?.remove();
    const dialog = document.createElement('dialog'); dialog.className = 'overview-dialog';
    dialog.innerHTML = `<div class="page-head"><div><h2>${escape(item.name)}</h2><span class="tool-id-chip">${escape(item.id)}</span></div><button class="btn btn-secondary" data-close>Close</button></div><div class="overview-detail-grid"><div><span>Current holder</span><strong>${escape(item.holder || '—')}</strong></div><div><span>Project</span><strong>${escape(item.site || 'Unassigned')}</strong></div><div><span>Status</span>${badge(item.status)}</div><div><span>Quantity</span><strong>${escape(item.qty)}</strong></div></div><h3>Movement history</h3>${activityTable(visibleActivity({...data,activity:data.activity.filter(r => r.toolIds?.includes(id))}))}<div class="overview-actions">${button('Request tools', 'request')}${button('Transfer', 'transfer')}${button('Return', 'return')}${button('Report issue', 'repair')}</div>`;
    root.appendChild(dialog); dialog.showModal();
    dialog.querySelector('[data-close]').onclick = () => {dialog.close(); dialog.remove(); render();};
    dialog.addEventListener('close', () => { dialog.remove(); render(); }, {once: true});
  }
  async function load(automatic = false) {
    const owner = root;
    const sourceMode = store().mode;
    if (!owner?.isConnected) return;
    if (loading) { reloadPending = true; return; }
    loading = true;
    if (!automatic) owner.innerHTML = '<div class="card card-pad" role="status">Loading saved movement records…</div>';
    try {
      let movementError;
      const [, latest] = await Promise.all([
        store().refresh().catch(error => { movementError = error; }),
        store().mode === 'live' && screen !== 'activity' ? window.EquipmentTracking.snapshot() : Promise.resolve(null)
      ]);
      if (root !== owner || !owner.isConnected || store().mode !== sourceMode) return;
      if (movementError && !latest) throw movementError;
      inventory = latest;
      if (!owner.querySelector('dialog[open]')) render();
      if (movementError) owner.querySelector('#overview-feedback').textContent = 'Inventory is current. Movement history could not load; retrying automatically.';
    }
    catch(error) {
      if (root !== owner || !owner.isConnected) return;
      if (automatic && owner.querySelector('#overview-feedback')) {
        owner.querySelector('#overview-feedback').textContent = 'Updates interrupted. Showing the last loaded records; retrying automatically.';
        return;
      }
      owner.innerHTML = `${header('Movement workspace', 'Connect your project records or try the workflow with demo data.')}<div class="card card-pad" role="alert"><h2>Records could not load</h2><p class="overview-error">${escape(error.message)}</p><div class="overview-actions"><button class="btn btn-primary" data-refresh>Retry</button><button class="btn btn-secondary" data-demo>Try demo data</button></div></div>`;
    }
    finally {
      if (root === owner) {
        loading = false;
        if (reloadPending) { reloadPending = false; void load(true); }
      }
    }
  }
  function dispose() { stopWatching?.(); stopWatching = null; controller?.abort(); controller = null; root = null; inventory = null; loading = false; reloadPending = false; }
  function watch() {
    stopWatching?.(); stopWatching = null;
    if (store().mode === 'live') stopWatching = window.EquipmentTracking.watch(() => load(true), message => {
      const label = root?.querySelector('.inventory-sync'); if (label) label.textContent = message;
    });
  }
  async function mount(id) {
    dispose(); screen = id; query = id === 'masterlist' ? window.mcpaSearch || '' : ''; status = ''; mine = false; site = '';
    root = document.getElementById('screen-' + id); if (!root) return;
    root.classList.add('movement-overview'); controller = new AbortController(); const signal = controller.signal;
    root.addEventListener('click', async event => {
      const el = event.target.closest('button'); if (!el) return;
      if (el.dataset.go) {showScreen(el.dataset.go); return;}
      if (el.dataset.tool) {detail(el.dataset.tool); return;}
      if (el.hasAttribute('data-export')) {
        const rows = visibleActivity(store().getState());
        const cell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'" + String(value ?? '')[0]).replace(/"/g, '""') + '"';
        const csv = [['Date','Action','Reference','Actor','Tools','Summary'],...rows.map(r => [r.createdAt,r.action,r.entityId,r.actor,(r.toolIds || []).join(', '),r.summary])].map(r => r.map(cell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'})); const link = document.createElement('a'); link.href=url; link.download='mcpa-movement-activity.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); return;
      }
      if (el.hasAttribute('data-demo')) {try {await store().setMode('demo');} catch (_) {} inventory = null; watch(); await load();}
      else if (el.hasAttribute('data-refresh')) await load();
    }, {signal});
    root.addEventListener('input', event => {if (event.target.matches('[data-search]')) {query=event.target.value; filter();}}, {signal});
    root.addEventListener('change', async event => {
      if (event.target.matches('[data-mode]')) {try {await store().setMode(event.target.value);} catch (_) {} inventory = null; watch(); await load(); return;}
      if (event.target.id === 'overview-status') status=event.target.value;
      if (event.target.id === 'overview-site') site=event.target.value;
      if (event.target.id === 'overview-mine') mine=event.target.checked;
      filter();
    }, {signal});
    window.addEventListener('mcpa:movement-change', () => { if (!loading && root?.querySelector('[data-mode]') && !root.querySelector('dialog[open]')) render(); }, {signal});
    watch();
    await load();
  }
  window.addEventListener('mcpa:movement-change', contextBar);
  window.MovementOverview = {mount, dispose, contextBar, escape};
})();
