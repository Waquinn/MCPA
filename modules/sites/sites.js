/* Scoped to Sites: the module loader executes this file on every visit. */
(function () {
  'use strict';

  const root = document.getElementById('sites-module');
  const dialog = root.querySelector('#sites-dialog');
  const siteStatuses = {
    active: ['Active', 'inuse'], discrepancy: ['Discrepancy', 'discrepancy'],
    verified: ['Verified', 'verified'], turnover: ['Turnover', 'pending'],
    idle: ['Idle Stock', 'available'], planning: ['Planning', 'pending'],
    completed: ['Completed', 'verified']
  };
  const toolStatuses = {
    available: ['Available', 'available'], inuse: ['In Use', 'inuse'],
    repair: ['For Repair', 'repair'], underrepair: ['Under Repair', 'underrepair'],
    missing: ['Missing', 'missing'], disposed: ['Disposed', 'disposed']
  };
  const state = { sites: [], equipment: [], selectedId: null, loading: false, saving: false, ready: false };
  let dialogReturnFocus = null;

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function normalizeName(value) { return value.trim().replace(/\s+/g, ' '); }
  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function formatDate(value) {
    if (!value) return 'Not recorded';
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function badge(value, statuses) {
    const [label, style] = statuses[value] || [value || 'Unknown', 'disposed'];
    return `<span class="badge badge-${style}">${escape(label)}</span>`;
  }
  function currentSite() { return state.sites.find(site => site.id === state.selectedId); }
  function siteEquipment(site) { return state.equipment.filter(item => item.site_id === site.id); }
  function visibleEquipment(site) { return siteEquipment(site).filter(item => item.quantity > 0); }
  function totalQuantity(items) { return items.reduce((sum, item) => sum + item.quantity, 0); }

  function client() {
    if (!window.supabaseClient) {
      if (!window.supabase?.createClient) throw new Error('The database connection could not load. Check your connection and try again.');
      // Same public project configuration as Masterlist. Reuse its client when loaded.
      window.supabaseClient = window.supabase.createClient(
        'https://zpqxlmiqwevhlstjirei.supabase.co',
        'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58'
      );
    }
    return window.supabaseClient;
  }

  function databaseError(error) {
    if (['PGRST205', '42703'].includes(error.code)) return 'Sites is not set up in the database yet. Contact your administrator to complete setup, then refresh.';
    if (error.code === '23505') return 'A site with this name already exists. Please use a different name.';
    if (error.code === '23503') return 'This site still has linked records and cannot be deleted. Its equipment and history must be retained.';
    if (['42501', 'PGRST301', 'PGRST303'].includes(error.code)) return 'Your database access does not allow this action. Please check your session or contact your administrator.';
    if (error.code === '23514') return 'Some site details are invalid. Please check the form and try again.';
    return error.message || 'The database could not be reached. Please try again.';
  }

  async function readAll(table, columns, order) {
    const records = [];
    // Supabase caps responses; fetch every page so counts do not silently truncate.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client().from(table).select(columns).order(order).range(offset, offset + 499);
      if (error) throw error;
      records.push(...(data || []));
      if (!data || data.length < 500) return records;
    }
  }

  // All database writes concern site metadata. Equipment and movement are read-only here.
  const repository = {
    async load() {
      const [sites, equipment, profiles] = await Promise.all([
        readAll('sites', '*', 'id'),
        readAll('equipment', 'id,asset_id,name,brand,model,serial_number,category,condition,tracking_type,quantity,unit,details,status,current_holder_id,site_id', 'id'),
        // A restricted profile must not hide otherwise readable equipment.
        readAll('profiles', 'id,name', 'id').catch(() => [])
      ]);
      const holders = new Map(profiles.map(profile => [profile.id, profile.name]));
      return {
        sites: sites.sort((a, b) => a.name.localeCompare(b.name)),
        equipment: equipment.map(item => {
          const status = String(item.status || '').toLowerCase().replace(/[\s_-]/g, '');
          const quantity = Number(item.quantity ?? (item.tracking_type === 'Individual' ? 1 : 0));
          return { ...item, holder: holders.get(item.current_holder_id) || item.current_holder_id || '—', quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0, status: status === 'forrepair' ? 'repair' : status };
        })
      };
    },
    async save(values, original) {
      let query = original
        ? client().from('sites').update(values).eq('id', original.id).eq('updated_at', original.updated_at)
        : client().from('sites').insert(values);
      const { data, error } = await query.select('*');
      if (error) throw error;
      if (!data?.length) throw new Error('This site changed or is no longer editable. Close this form and refresh before trying again.');
      return data[0];
    },
    async remove(site) {
      // The foreign key also enforces this if equipment is assigned after this check.
      const { data: equipment, error: readError } = await client().from('equipment').select('id').eq('site_id', site.id).limit(1);
      if (readError) throw readError;
      if (equipment?.length) throw new Error('This site has linked equipment and cannot be deleted.');
      const { data, error } = await client().from('sites').delete().eq('id', site.id).eq('updated_at', site.updated_at).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('This site changed or is no longer editable. Close this dialog and refresh before trying again.');
    },
    // Replace this reader when the movement table is introduced. Never infer history
    // from the current holder, site assignment, registration date, or mock screens.
    async movements() { return []; }
  };

  function feedback(message, isError = false) {
    const element = root.querySelector('#sites-feedback');
    element.textContent = message;
    element.classList.toggle('hidden', !message);
    element.classList.toggle('is-error', isError);
    element.setAttribute('role', isError ? 'alert' : 'status');
  }

  function formError(message) {
    const element = root.querySelector('#sites-form-error');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('hidden', !message);
    if (message) element.focus();
  }

  async function refresh() {
    if (state.loading || state.saving) return;
    state.loading = true;
    feedback('');
    root.querySelector('#sites-list').setAttribute('aria-busy', 'true');
    root.querySelectorAll('[data-action="refresh"]').forEach(button => { button.disabled = true; });
    try {
      const result = await repository.load();
      if (!root.isConnected) return;
      state.sites = result.sites;
      state.equipment = result.equipment;
      state.ready = true;
      if (!currentSite()) state.selectedId = (state.sites.find(site => site.name === 'Casa Buena') || state.sites[0])?.id || null;
      render();
    } catch (error) {
      if (!root.isConnected) return;
      feedback(databaseError(error), true);
      if (!state.ready) {
        root.querySelector('#sites-list').innerHTML = '<div class="card empty-state sites-full"><p class="t">Unable to load sites</p><p class="d">Please check the database connection and try again.</p><button type="button" class="btn btn-secondary btn-sm" data-action="refresh">Try Again</button></div>';
        root.querySelector('#site-detail-content').innerHTML = '<button type="button" class="sites-back eyebrow" data-action="all-sites">← All Sites</button><div class="card empty-state"><p class="t">Unable to load site details</p><button type="button" class="btn btn-secondary btn-sm" data-action="refresh">Try Again</button></div>';
      }
    } finally {
      state.loading = false;
      root.querySelector('#sites-list').setAttribute('aria-busy', 'false');
      root.querySelectorAll('[data-action="refresh"]').forEach(button => { button.disabled = false; });
    }
  }

  function render() {
    root.querySelector('#sites-list').innerHTML = state.sites.length ? state.sites.map(site => {
      const items = visibleEquipment(site);
      const count = (...statuses) => totalQuantity(items.filter(item => statuses.includes(item.status)));
      const stats = [['Total', totalQuantity(items)], ['Avail.', count('available')], ['In Use', count('inuse')], ['Repair', count('repair', 'underrepair')]];
      if (count('missing')) stats.push(['Missing', count('missing')]);
      if (count('disposed')) stats.push(['Disposed', count('disposed')]);
      return `<button type="button" class="card site-card" data-action="open-site" data-id="${escape(site.id)}" aria-label="View ${escape(site.name)}">
        <span class="site-card-top"><span><span class="site-card-title">${escape(site.name)}</span><span class="eng">${escape(site.assigned_engineer)} · ${escape(site.phase)}</span></span>${badge(site.status, siteStatuses)}</span>
        <span class="site-stat-row">${stats.map(([label, number]) => `<span class="site-stat"><span class="n">${number}</span><span class="l">${label}</span></span>`).join('')}</span>
      </button>`;
    }).join('') : '<div class="card empty-state sites-full"><p class="t">No sites yet</p><p class="d">Add a site to start tracking its equipment.</p><button type="button" class="btn btn-secondary btn-sm" data-action="add-site">+ Add Site</button></div>';
    renderDetail();
  }

  function inventoryTable(items, emptyText = 'No equipment is currently assigned to this site.') {
    return `<div class="table-wrap"><table><thead><tr><th>Tool</th><th>Quantity</th><th>Status</th><th>Current Holder</th><th><span class="sites-muted">Details</span></th></tr></thead><tbody>${items.length ? items.map(item => `<tr>
      <td class="cell-name">${escape(item.name)}<div class="cell-sub mono">${escape(item.asset_id)}</div></td>
      <td class="mono">${item.quantity}${item.unit ? ` <span class="sites-muted">${escape(item.unit)}</span>` : ''}</td>
      <td>${badge(item.status, toolStatuses)}</td><td>${escape(item.holder)}</td>
      <td class="sites-row-action"><button type="button" class="sites-text-button" data-action="view-tool" data-id="${escape(item.id)}" aria-label="View ${escape(item.name)} ${escape(item.asset_id)}">View →</button></td>
    </tr>`).join('') : `<tr><td colspan="5" class="empty-state">${escape(emptyText)}</td></tr>`}</tbody></table></div>`;
  }

  function renderDetail() {
    const container = root.querySelector('#site-detail-content');
    const site = currentSite();
    if (!site) {
      container.innerHTML = '<button type="button" class="sites-back eyebrow" data-action="all-sites">← All Sites</button><div class="card empty-state"><p class="t">No site selected</p><p class="d">Add a site or select one from All Sites.</p></div>';
      return;
    }
    const items = visibleEquipment(site);
    const hiddenCount = siteEquipment(site).length - items.length;
    container.innerHTML = `
      <div class="page-head"><div>
        <button type="button" class="sites-back eyebrow" data-action="all-sites">← All Sites</button>
        <h1 class="display" id="site-heading">${escape(site.name)}</h1>
        <p class="sub">${escape(site.location)} · ${escape(site.phase)} — ${site.progress}% complete</p>
      </div><div class="page-head-actions">
        ${badge(site.status, siteStatuses)}
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-site">Edit Site</button>
        <button type="button" class="btn btn-danger btn-sm" data-action="delete-site">Delete Site</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="review-tools">Review Assigned Tools</button>
      </div></div>
      <div class="grid grid-4 sites-summary">
        <div class="card card-pad"><span class="k">Assigned Engineer</span><div class="v">${escape(site.assigned_engineer)}</div></div>
        <div class="card card-pad"><span class="k">Total Tools On Site</span><div class="v">${totalQuantity(items)} tools</div></div>
        <div class="card card-pad"><span class="k">Last Inventory Check</span><div class="v">${formatDate(site.last_inventory_check)}</div></div>
        <div class="card card-pad"><span class="k">Last Transfer</span><div class="v">Not recorded</div><button type="button" class="sites-text-button" data-action="view-movements">View movement history →</button></div>
      </div>
      <div class="section-title sites-section-title"><h2>Site Inventory</h2><span class="eyebrow">Zero-quantity items are hidden</span></div>
      <div class="card">${inventoryTable(items)}</div>
      <p class="sites-muted sites-inventory-note">${hiddenCount ? `${hiddenCount} zero-quantity record${hiddenCount === 1 ? ' is' : 's are'} hidden. ` : ''}Equipment assignments and movement are shown for reference only.</p>`;
  }

  function openSite(id) {
    if (!state.sites.some(site => site.id === id)) return;
    state.selectedId = id;
    feedback('');
    renderDetail();
    showScreen('site-detail', () => setActiveNav('sites'));
  }

  function openDialog(title, content, wide = false) {
    if (!dialog.open) dialogReturnFocus = document.activeElement;
    root.querySelector('#sites-dialog-title').textContent = title;
    root.querySelector('#sites-dialog-content').innerHTML = content;
    dialog.classList.toggle('is-wide', wide);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    (dialog.querySelector('[autofocus]') || dialog.querySelector('.sites-close')).focus();
  }

  function closeDialog() {
    if (state.saving) return;
    dialog.close();
    if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
    else root.querySelector('#screen-site-detail.active [data-action="edit-site"], #screen-sites.active [data-action="add-site"]')?.focus();
  }

  function editSite(site = null) {
    const value = (field, fallback = '') => escape(site?.[field] ?? fallback);
    openDialog(site ? 'Edit Site' : 'Add Site', `
      <form id="sites-form" data-id="${value('id')}">
        <p class="sites-dialog-description">Keep the project details and assigned engineer up to date. Required fields are marked *.</p>
        <div id="sites-form-error" class="sites-form-error hidden" role="alert" tabindex="-1"></div>
        <div class="form-grid">
          <div class="field full"><label for="site-name">Site Name *</label><input id="site-name" name="name" value="${value('name')}" maxlength="120" required autofocus autocomplete="off"></div>
          <div class="field full"><label for="site-location">Location *</label><input id="site-location" name="location" value="${value('location')}" maxlength="240" required></div>
          <div class="field"><label for="site-engineer">Assigned Engineer *</label><input id="site-engineer" name="assigned_engineer" value="${value('assigned_engineer')}" maxlength="120" required></div>
          <div class="field"><label for="site-phase">Project Phase *</label><input id="site-phase" name="phase" value="${value('phase', 'Planning Phase')}" maxlength="80" required></div>
          <div class="field"><label for="site-status">Status *</label><select id="site-status" name="status" required>${Object.entries(siteStatuses).map(([key, [label]]) => `<option value="${key}"${(site?.status || 'planning') === key ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
          <div class="field"><label for="site-progress">Completion (%) *</label><input id="site-progress" name="progress" type="number" value="${value('progress', 0)}" min="0" max="100" step="1" required></div>
          <div class="field full"><label for="site-check">Last Inventory Check</label><input id="site-check" name="last_inventory_check" type="date" value="${value('last_inventory_check')}" max="${today()}"></div>
        </div>
        <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="btn btn-primary">${site ? 'Save Changes' : 'Create Site'}</button></div>
      </form>`);
  }

  async function saveSite(form) {
    if (state.saving || !form.reportValidity()) return;
    const original = state.sites.find(site => site.id === form.dataset.id);
    const values = Object.fromEntries(new FormData(form));
    for (const field of ['name', 'location', 'assigned_engineer', 'phase']) {
      values[field] = normalizeName(values[field]);
      if (!values[field]) { formError('Please complete all required fields. Blank spaces are not valid values.'); return; }
    }
    if (state.sites.some(site => site.id !== original?.id && normalizeName(site.name).toLowerCase() === values.name.toLowerCase())) {
      formError('A site with this name already exists. Please use a different name.'); return;
    }
    values.progress = Number(values.progress);
    if (!Number.isInteger(values.progress) || values.progress < 0 || values.progress > 100) { formError('Completion must be a whole number from 0 to 100.'); return; }
    if (!(values.status in siteStatuses)) { formError('Please select a valid site status.'); return; }
    if (values.last_inventory_check > today()) { formError('The inventory check cannot be in the future.'); return; }
    values.last_inventory_check ||= null;
    formError('');
    setSaving(true);
    try {
      const saved = await repository.save(values, original);
      if (!root.isConnected) return;
      state.sites = [...state.sites.filter(site => site.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name));
      state.selectedId = saved.id;
      render();
      setSaving(false);
      closeDialog();
      if (original) renderDetail();
      feedback(`${saved.name} ${original ? 'updated' : 'created'} successfully.`);
    } catch (error) {
      formError(databaseError(error));
    } finally { setSaving(false); }
  }

  function setSaving(saving) {
    state.saving = saving;
    dialog.setAttribute('aria-busy', String(saving));
    dialog.querySelectorAll('button, input, select').forEach(element => { element.disabled = saving; });
    const submit = dialog.querySelector('[type="submit"], [data-action="confirm-delete"]');
    if (submit) {
      if (saving) { submit.dataset.label = submit.textContent; submit.textContent = 'Saving…'; }
      else if (submit.dataset.label) submit.textContent = submit.dataset.label;
    }
  }

  function deleteSite() {
    const site = currentSite();
    if (!site) return;
    const linked = siteEquipment(site).length;
    openDialog('Delete Site', `
      <div id="sites-form-error" class="sites-form-error hidden" role="alert" tabindex="-1"></div>
      <p class="sites-dialog-description">${linked ? `${escape(site.name)} has ${linked} linked equipment record${linked === 1 ? '' : 's'}, including any zero-quantity records. A site with linked equipment cannot be deleted.` : `Delete ${escape(site.name)}? This permanently removes the site record and cannot be undone.`}</p>
      <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog" autofocus>${linked ? 'Close' : 'Cancel'}</button>${linked ? '' : '<button type="button" class="btn btn-danger" data-action="confirm-delete">Delete Site</button>'}</div>`);
  }

  async function confirmDelete() {
    if (state.saving) return;
    const site = currentSite();
    if (!site) return;
    setSaving(true);
    try {
      await repository.remove(site);
      if (!root.isConnected) return;
      state.sites = state.sites.filter(record => record.id !== site.id);
      state.selectedId = null;
      render();
      setSaving(false);
      closeDialog();
      showScreen('sites');
      root.querySelector('[data-action="add-site"]').focus();
      feedback(`${site.name} deleted successfully.`);
    } catch (error) { formError(databaseError(error)); }
    finally { setSaving(false); }
  }

  function reviewTools() {
    const site = currentSite();
    if (!site) return;
    openDialog(`Assigned Tools — ${site.name}`, `
      <p class="sites-dialog-description">Review the equipment assigned to this site, including zero-quantity records. Assignments and holders are read-only.</p>
      <div class="table-toolbar">
        <div class="field sites-review-search"><label for="sites-tool-search">Search equipment</label><input type="search" id="sites-tool-search" placeholder="Tool name, asset ID, brand or holder" autofocus></div>
        <div class="field"><label for="sites-tool-status">Status</label><select id="sites-tool-status" class="chip-filter"><option value="">All statuses</option>${Object.entries(toolStatuses).map(([key, [label]]) => `<option value="${key}">${label}</option>`).join('')}</select></div>
      </div>
      <div id="sites-review-results" class="card" aria-live="polite"></div>
      <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button></div>`, true);
    filterTools();
  }

  function filterTools() {
    const target = root.querySelector('#sites-review-results');
    if (!target || !currentSite()) return;
    const search = root.querySelector('#sites-tool-search').value.trim().toLowerCase();
    const status = root.querySelector('#sites-tool-status').value;
    const items = siteEquipment(currentSite()).filter(item => (!status || item.status === status) && (!search || [item.name, item.asset_id, item.brand, item.holder, item.current_holder_id].some(value => String(value || '').toLowerCase().includes(search))));
    target.innerHTML = inventoryTable(items, search || status ? 'No equipment matches your filters.' : 'No equipment is currently assigned to this site.');
  }

  function movementTable(records) {
    if (!records.length) return '<div class="empty-state sites-movement-empty"><p class="t">No movement records available</p><p class="d">Movement history will appear here when records are available. This view is read-only.</p></div>';
    return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Tool</th><th>From</th><th>To</th><th>Quantity</th></tr></thead><tbody>${records.map(record => `<tr><td>${escape(formatDate(record.date))}</td><td>${escape(record.asset_id)}</td><td>${escape(record.from)}</td><td>${escape(record.to)}</td><td>${escape(record.quantity)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function viewMovements() {
    const site = currentSite();
    if (!site) return;
    const records = await repository.movements(site.id);
    openDialog(`Movement History — ${site.name}`, `<p class="sites-dialog-description">Equipment movement into and out of this site.</p><div class="card">${movementTable(records)}</div><div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button></div>`, true);
  }

  async function viewTool(id) {
    const site = currentSite();
    const item = site && siteEquipment(site).find(record => record.id === id);
    if (!item) return;
    const fromReview = Boolean(root.querySelector('#sites-review-results'));
    const records = await repository.movements(site.id, item.id);
    const fields = [['Asset ID', item.asset_id], ['Category', item.category], ['Brand', item.brand], ['Model', item.model], ['Serial Number', item.serial_number], ['Condition', item.condition], ['Tracking Type', item.tracking_type], ['Quantity', `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`], ['Current Site', site.name], ['Current Holder', item.holder], ['Identifying Details', item.details]];
    openDialog(item.name, `
      <p class="sites-dialog-description">Equipment details for ${escape(site.name)}.</p>
      <div class="sites-tool-details">${fields.map(([label, value]) => `<div class="kv"><span class="k">${label}</span><span class="v">${escape(value ?? '—') || '—'}</span></div>`).join('')}<div class="kv"><span class="k">Status</span><span class="v">${badge(item.status, toolStatuses)}</span></div></div>
      <div class="section-title"><h2>Movement History</h2><span class="eyebrow">Read only</span></div>
      <div class="card">${movementTable(records)}</div>
      <div class="sites-dialog-actions">${fromReview ? '<button type="button" class="btn btn-secondary" data-action="review-tools">← Assigned Tools</button>' : ''}<button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button></div>`);
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled || state.saving) return;
    const actions = {
      refresh, 'add-site': () => editSite(), 'open-site': () => openSite(button.dataset.id),
      'all-sites': () => { feedback(''); showScreen('sites'); },
      'edit-site': () => { if (currentSite()) editSite(currentSite()); },
      'delete-site': deleteSite, 'confirm-delete': confirmDelete,
      'review-tools': reviewTools, 'view-tool': () => viewTool(button.dataset.id),
      'view-movements': viewMovements, 'close-dialog': closeDialog
    };
    actions[button.dataset.action]?.();
  });
  root.addEventListener('submit', event => {
    if (event.target.id !== 'sites-form') return;
    event.preventDefault();
    saveSite(event.target);
  });
  root.addEventListener('input', event => { if (event.target.id === 'sites-tool-search') filterTools(); });
  root.addEventListener('change', event => { if (event.target.id === 'sites-tool-status') filterTools(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  refresh();
})();
