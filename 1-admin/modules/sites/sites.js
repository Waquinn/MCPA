/* Projects retains the projects DOM IDs for existing navigation. */
(function () {
  'use strict';

  const root = document.getElementById('sites-module');
  window.MCPAProjects?.dispose();
  const dialog = root.querySelector('#sites-dialog');
  const demo = window.MovementStore?.mode === 'demo';
  const context = () => window.MovementStore?.getContext() || {role:null,name:'',id:null};
  const isEngineer = () => window.MCPAPermissions.operational(context().role);
  const readOnly = demo || context().role !== 'admin';
  if(isEngineer())root.querySelector('#screen-sites .sub').textContent='Your assigned projects and their recorded accountability.';
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
  const state = { sites: [], equipment: [], profiles: [], selectedId: null, loading: false, saving: false, ready: false, dirty: false, disposed: false, scope: isEngineer() ? 'mine' : 'all', search: '', includeArchived: false, review: { search: '', status: '' } };
  let dialogReturnFocus = null;

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function normalizeName(value) { return value.trim().replace(/\s+/g, ' '); }
  function today() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = type => parts.find(value => value.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function formatDate(value) {
    if (!value) return 'Not recorded';
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatTimestamp(value) {
    const date = new Date(value);
    return !value || Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Manila' });
  }
  function badge(value, statuses) {
    const [label, style] = statuses[value] || [value || 'Unknown', 'disposed'];
    return `<span class="badge badge-${style}">${escape(label)}</span>`;
  }
  function currentSite() { return state.sites.find(site => site.id === state.selectedId); }
  function assignedToMe(site) {
    const user = context();
    if (site.assigned_engineer_id) return site.assigned_engineer_id === user.id;
    return demo && Boolean(user.name) && site.assigned_engineer === user.name;
  }
  function filteredSites() {
    return state.sites.filter(site => (state.includeArchived || (demo ? !site.archived_at : site.is_active === true))
      && (state.scope !== 'mine' || assignedToMe(site))
      && (!state.search || [site.name, site.location, site.assigned_engineer, site.phase].some(value => String(value || '').toLowerCase().includes(state.search))));
  }
  function siteEquipment(site) { return state.equipment.filter(item => item.site_id === site.id); }
  function visibleEquipment(site) { return siteEquipment(site).filter(item => item.quantity > 0); }
  function totalQuantity(items) { return items.reduce((sum, item) => sum + item.quantity, 0); }

  function client() {
    if (!window.supabaseClient) {
      if (!window.supabase?.createClient) throw projectError('The project service could not load. Reload the page and try again.');
      // Same public project configuration as Masterlist. Reuse its client when loaded.
      window.supabaseClient = window.supabase.createClient(
        'https://zpqxlmiqwevhlstjirei.supabase.co',
        'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58'
      );
    }
    return window.supabaseClient;
  }

  function projectError(message) {
    return Object.assign(new Error(message), {projectUserMessage: message});
  }

  function databaseError(error = {}, operation = 'request') {
    // Keep a diagnostic code in DevTools, never server messages, SQL, form values
    // or response details. The Network response retains the original diagnostic.
    const code = /^[A-Z0-9]{5,12}$/.test(error.code || '') ? error.code : 'UNKNOWN';
    console.warn('[Projects] Request failed', {operation, code});
    if (['42P01', '42703', '42883', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) {
      return 'Projects needs a database configuration update. Contact your administrator, then retry.';
    }
    if (error.code === '23505') return 'A project with this name already exists. Please use a different name.';
    if (['23503', '23001'].includes(error.code)) return 'This project has linked records. Preserve its equipment and history by archiving it.';
    if (error.code === '42501') return 'Your account does not have permission to perform this project action. Contact your administrator if you need access.';
    if (['PGRST301', 'PGRST303'].includes(error.code)) return 'Your database session has expired or is invalid. Sign in again, then retry.';
    if (error.code === '23514') return 'Some project details are invalid. Please check the form and try again.';
    if (error.projectUserMessage) return error.projectUserMessage;
    if (navigator.onLine === false || /failed to fetch|networkerror|network request failed|load failed/i.test(error.message || '')) {
      return 'The project service could not be reached. Check your connection and try again.';
    }
    return 'Projects could not complete this request. Try again. If the problem continues, contact your administrator.';
  }

  async function readAll(table, columns, order) {
    const records = [];
    // Supabase caps responses; fetch every page so counts do not silently truncate.
    for (let offset = 0; ;) {
      const { data, count, error } = await client().from(table).select(columns, { count: 'exact' }).order(order).range(offset, offset + 499);
      if (error) throw error;
      records.push(...(data || []));
      if (!data?.length || (count != null ? records.length >= count : data.length < 500)) return records;
      offset += data.length;
    }
  }

  // All database writes concern site metadata. Equipment and movement are read-only here.
  const repository = {
    async load() {
      if (!demo && window.MCPAPermissions.operational(context().role)) {
        const {data:snapshot,error}=await client().rpc('mcpa_project_snapshot');
        if(error)throw error;
        if(!Array.isArray(snapshot?.sites)||!Array.isArray(snapshot?.tools)||!Array.isArray(snapshot?.history))throw projectError('Projects returned an unexpected response. Contact your administrator, then retry.');
        state.history=snapshot.history||[];
        return {sites:snapshot.sites,profiles:[],equipment:snapshot.tools.map(tool=>({...tool,id:tool.dbId,asset_id:tool.id,quantity:tool.qty,category:tool.cat,site_id:tool.siteId,current_holder_id:tool.holderId,holder:tool.holder||'Unassigned'}))};
      }
      if (demo || !window.MCPAPermissions.fullInventory(context().role)) {
        await window.MovementStore.initialize();
        const snapshot = window.MovementStore.getState();
        return {
          sites: snapshot.sites.map(site => ({...site, location: site.location || 'Demo project', assigned_engineer: site.assigned_engineer || site.engineer || 'Unassigned', phase: site.phase || '', status: site.status || 'active', progress: site.progress || 0})),
          equipment: snapshot.tools.map(tool => ({...tool, id: tool.id, asset_id: tool.id, quantity: tool.qty, category: tool.cat, site_id: tool.siteId || snapshot.sites.find(site => site.name === tool.site)?.id, current_holder_id: tool.holderId, holder: tool.holder || 'Unassigned'})),
          profiles: snapshot.users || []
        };
      }
      const [sites, equipment, profiles] = await Promise.all([
        readAll('sites', '*', 'id'),
        readAll('equipment', '*', 'id'),
        // A restricted profile must not hide otherwise readable equipment.
        readAll('profiles', 'id,name,role', 'id').catch(() => [])
      ]);
      const holders = new Map(profiles.map(profile => [profile.id, profile.name]));
      return {
        sites: sites.map(site=>({...site,assigned_engineer:site.assigned_engineer_id?holders.get(site.assigned_engineer_id)||'Accountable profile unavailable':site.assigned_engineer})).sort((a, b) => a.name.localeCompare(b.name)),
        profiles: profiles.filter(profile => !profile.role || /engineer|architect/i.test(profile.role)),
        equipment: equipment.map(item => {
          const status = String(item.status || '').toLowerCase().replace(/[\s_-]/g, '');
          const quantity = Number(item.quantity ?? (item.tracking_type === 'Individual' ? 1 : 0));
          return { ...item, holder: holders.get(item.current_holder_id) || item.current_holder_id || '—', quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0, status: status === 'forrepair' ? 'repair' : status };
        })
      };
    },
    async save(values, original) {
      if (readOnly || isEngineer()) throw projectError('Only an Admin can edit live project records.');
      let query = original
        ? client().from('sites').update(values).eq('id', original.id).eq('updated_at', original.updated_at)
        : client().from('sites').insert(values);
      const { data, error } = await query.select('*');
      if (error) throw error;
      if (!data?.length) throw projectError('This project changed or is no longer editable. Close this form and retry after the next update.');
      return data[0];
    },
    async history(siteId) {
      if (demo) return [];
      if (window.MCPAPermissions.operational(context().role)) {
        const {data,error}=await client().rpc('mcpa_project_snapshot');
        if(error)throw error;
        if(!Array.isArray(data?.history))throw projectError('Project history returned an unexpected response. Contact your administrator, then retry.');
        return data.history.filter(item=>item.project_id===siteId);
      }
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, count, error } = await client().from('project_history').select('*', {count: 'exact'}).eq('project_id', siteId).order('changed_at', {ascending: false}).range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data?.length || (count != null ? rows.length >= count : data.length < 500)) return rows;
      }
    },
    async movements(siteId, equipmentId) {
      if (!window.MovementStore) return [];
      const snapshot = await window.MovementStore.refresh();
      const site = state.sites.find(item => item.id === siteId);
      const asset = snapshot.tools.find(item => (item.dbId || item.id) === equipmentId);
      const rows = [];
      [...snapshot.transfers.filter(item => item.status === 'received'), ...snapshot.returns].forEach(record => {
        (record.source || []).forEach(source => {
          if (equipmentId && source.toolId !== asset?.id) return;
          const inspection = (record.inspections || record.conditions || []).find(item => item.toolId === source.toolId);
          if (!inspection || inspection.condition === 'lost') return;
          if (source.siteId !== siteId && record.destinationId !== siteId && source.site !== site?.name && record.destination !== site?.name) return;
          rows.push({date: record.receivedAt || record.createdAt, asset_id: source.toolId, from: source.site || 'Unassigned', to: record.destination || source.site, quantity: source.qty ?? snapshot.tools.find(item => item.id === source.toolId)?.qty ?? 1});
        });
      });
      return rows.sort((a,b) => b.date.localeCompare(a.date));
    }
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

  function syncControls() {
    root.querySelectorAll('[data-action="refresh"]').forEach(button => { button.disabled = state.loading || state.saving; });
    root.querySelectorAll('[data-action="add-site"], [data-action="edit-site"], [data-action="archive-site"]').forEach(button => {
      if(readOnly){button.remove();return;}
      button.disabled = readOnly || isEngineer() || !state.ready || state.loading || state.saving;
      button.hidden = readOnly || isEngineer();
    });
  }

  async function refresh(automatic = false) {
    if (state.loading || state.saving || state.disposed || (automatic && (dialog.open || state.dirty || document.hidden || !root.querySelector('.screen.active')))) return;
    state.loading = true;
    feedback('');
    root.querySelector('#sites-list').setAttribute('aria-busy', 'true');
    syncControls();
    try {
      const result = await repository.load();
      if (!root.isConnected) return;
      const firstLoad = !state.ready;
      state.sites = result.sites;
      state.equipment = result.equipment;
      state.profiles = result.profiles;
      if (firstLoad) state.selectedId = filteredSites()[0]?.id || null;
      else if (state.selectedId && !currentSite()) {
        state.selectedId = null;
        if (root.querySelector('#screen-site-detail.active')) showScreen('sites');
        feedback('This project is no longer available. The project list has been updated.');
      }
      render();
      state.ready = true;
    } catch (error) {
      if (!root.isConnected) return;
      const message = databaseError(error, 'load');
      feedback(message, true);
      if (!state.ready) {
        root.querySelector('#sites-list').innerHTML = `<div class="card empty-state sites-full"><p class="t">Unable to load projects</p><p class="d">${escape(message)}</p><button type="button" class="btn btn-secondary btn-sm" data-action="refresh">Try Again</button></div>`;
        root.querySelector('#site-detail-content').innerHTML = '<button type="button" class="sites-back eyebrow" data-action="all-sites">← All Projects</button><div class="card empty-state"><p class="t">Unable to load project details</p><button type="button" class="btn btn-secondary btn-sm" data-action="refresh">Try Again</button></div>';
      }
    } finally {
      state.loading = false;
      root.querySelector('#sites-list').setAttribute('aria-busy', 'false');
      syncControls();
    }
  }

  function render() {
    const projects = filteredSites();
    root.querySelector('#projects-count').textContent = `${projects.length} of ${state.sites.length} projects · ${new Set(state.sites.filter(site => !site.archived_at).map(site => site.assigned_engineer_id || site.assigned_engineer).filter(value => value && value !== 'Unassigned')).size} assigned engineers / architects`;
    const scope=root.querySelector('#projects-scope');
    if(scope){scope.value=state.scope;scope.closest('label').hidden=readOnly;}
    root.querySelector('#projects-mode-note').textContent = demo ? 'Demo projects are read-only.' : 'Projects and equipment update automatically. Admins manage project details and assignments.';
    root.querySelector('#sites-list').innerHTML = projects.length ? projects.map(site => {
      const items = visibleEquipment(site);
      const count = (...statuses) => totalQuantity(items.filter(item => statuses.includes(item.status)));
      const totals = window.EquipmentTracking.tally(items);
      const stats = [['Total', totals.total], ['Available', totals.available], ['Deployed', totals.deployed], ['Repair', count('repair', 'underrepair')]];
      if (count('missing')) stats.push(['Missing', count('missing')]);
      if (count('disposed')) stats.push(['Disposed', count('disposed')]);
      return `<button type="button" class="card site-card" data-action="open-site" data-id="${escape(site.id)}" aria-label="View ${escape(site.name)}">
        <span class="site-card-top"><span><span class="site-card-title">${escape(site.name)}</span><span class="eng">${escape(site.assigned_engineer)} · ${escape(site.phase || 'Phase not specified')}</span><span class="sites-muted">${escape(site.location)}</span></span>${site.is_active === false ? '<span class="badge badge-disposed">Archived</span>' : badge(site.status, siteStatuses)}</span>
        <span class="site-stat-row">${stats.filter(([, number]) => number > 0).map(([label, number]) => `<span class="site-stat"><span class="n">${number}</span><span class="l">${label}</span></span>`).join('')}</span>
      </button>`;
    }).join('') : `<div class="card empty-state sites-full"><p class="t">${state.scope === 'mine' ? 'No projects assigned to you' : 'No matching projects'}</p><p class="d">${state.scope === 'mine' ? 'An Admin can assign your profile to a project.' : 'Adjust the filters or add a project to track its equipment.'}</p><button type="button" class="btn btn-secondary btn-sm" data-action="add-site">+ Add Project</button></div>`;
    renderDetail();
    syncControls();
  }

  function inventoryTable(items, emptyText = 'No equipment is currently assigned to this project.') {
    return `<div class="table-wrap"><table><thead><tr><th>Tool</th><th>Quantity</th><th>Status</th><th>Current Holder</th><th><span class="sites-muted">Details</span></th></tr></thead><tbody>${items.length ? items.map(item => `<tr>
      <td class="cell-name"><div class="equipment-identity">${window.EquipmentVisual.thumbnail(item)}<div>${escape(item.name)}<div class="cell-sub mono">${escape(item.asset_id)}</div></div></div></td>
      <td class="mono">${item.quantity}${item.unit ? ` <span class="sites-muted">${escape(item.unit)}</span>` : ''}</td>
      <td>${badge(item.status, toolStatuses)}<div class="cell-sub">${escape(window.EquipmentTracking.availability(item))}</div></td><td>${escape(item.holder)}</td>
      <td class="sites-row-action"><button type="button" class="sites-text-button" data-action="view-tool" data-id="${escape(item.id)}" aria-label="View ${escape(item.name)} ${escape(item.asset_id)}">View →</button></td>
    </tr>`).join('') : `<tr><td colspan="5" class="empty-state">${escape(emptyText)}</td></tr>`}</tbody></table></div>`;
  }

  function renderDetail() {
    const container = root.querySelector('#site-detail-content');
    const site = currentSite();
    if (!site) {
      container.innerHTML = '<button type="button" class="sites-back eyebrow" data-action="all-sites">← All Projects</button><div class="card empty-state"><h1 class="t" id="site-heading">No project selected</h1><p class="d">Select a project from your authorized project list.</p></div>';
      return;
    }
    const items = visibleEquipment(site);
    const hiddenCount = siteEquipment(site).length - items.length;
    container.innerHTML = `
      <div class="page-head"><div>
        <button type="button" class="sites-back eyebrow" data-action="all-sites">← All Projects</button>
        <h1 class="display" id="site-heading">${escape(site.name)}</h1>
        <p class="sub">${escape(site.location)} · ${escape(site.phase)} — ${site.progress}% complete</p>
      </div><div class="page-head-actions">
        ${badge(site.status, siteStatuses)}
        <button type="button" class="btn btn-secondary btn-sm" data-action="project-history">Project History</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-site">Edit Project</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="archive-site">${site.is_active === false ? 'Restore Project' : 'Archive Project'}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="review-tools">Review Assigned Tools</button>
      </div></div>
      <div class="grid grid-4 sites-summary">
        <div class="card card-pad"><span class="k">Accountable Engineer / Architect</span><div class="v">${escape(site.assigned_engineer)}</div>${site.assigned_engineer_id ? '' : '<span class="sites-muted">Profile link not recorded</span>'}</div>
        <div class="card card-pad"><span class="k">Equipment at Project</span><div class="v">${totalQuantity(items)} units</div></div>
        <div class="card card-pad"><span class="k">Last Inventory Check</span><div class="v">${formatDate(site.last_inventory_check)}</div></div>
        <div class="card card-pad"><span class="k">Last Movement</span><div class="v" data-last-movement>Loading…</div><button type="button" class="sites-text-button" data-action="view-movements">View movement history →</button></div>
      </div>
      <div class="section-title sites-section-title"><h2>Project Inventory</h2><span class="eyebrow">Zero-quantity items are hidden</span></div>
      <div class="card">${inventoryTable(items)}</div>
      <p class="sites-muted sites-inventory-note">${hiddenCount ? `${hiddenCount} zero-quantity record${hiddenCount === 1 ? ' is' : 's are'} hidden. ` : ''}Equipment assignments and movement are shown for reference only.</p>`;
    syncControls();
    const lastMovement = container.querySelector('[data-last-movement]');
    repository.movements(site.id).then(records => {
      if (lastMovement.isConnected) lastMovement.textContent = records.length ? formatDate(records[0].date) : 'Not recorded';
    }).catch(() => { if (lastMovement.isConnected) lastMovement.textContent = 'History unavailable'; });
  }

  function openSite(id) {
    if (!state.sites.some(site => site.id === id)) return;
    state.selectedId = id;
    feedback('');
    renderDetail();
    showScreen('site-detail', () => setActiveNav('sites'));
  }

  function openDialog(title, content, wide = false, view = '') {
    if (!root.isConnected) return;
    if (!dialog.open) dialogReturnFocus = document.activeElement;
    root.querySelector('#sites-dialog-title').textContent = title;
    root.querySelector('#sites-dialog-content').innerHTML = content;
    dialog.classList.toggle('is-wide', wide);
    dialog.dataset.view = view;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    (dialog.querySelector('[autofocus]') || dialog.querySelector('.sites-close')).focus();
  }

  function closeDialog() {
    if (state.saving) return;
    dialog.close();
    state.dirty = false;
    void refresh(true);
    if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
    else root.querySelector('#screen-site-detail.active [data-action="edit-site"], #screen-sites.active [data-action="add-site"]')?.focus();
  }

  function editSite(site = null) {
    if (readOnly || isEngineer() || !state.ready || state.loading) return;
    const value = (field, fallback = '') => escape(site?.[field] ?? fallback);
    const legacy = site && !state.profiles.some(profile => profile.id === site.assigned_engineer_id);
    state.dirty = false;
    openDialog(site ? 'Edit Project' : 'Add Project', `
      <form id="sites-form" data-id="${value('id')}">
        <p class="sites-dialog-description">Changes retain the previous and new values in Project History. Select an existing Engineer / Architect profile; one person may handle multiple projects. Required fields are marked *.</p>
        <div id="sites-form-error" class="sites-form-error hidden" role="alert" tabindex="-1"></div>
        <div class="form-grid">
          <div class="field full"><label for="site-name">Project Name *</label><input id="site-name" name="name" value="${value('name')}" maxlength="120" required autofocus autocomplete="off"></div>
          <div class="field full"><label for="site-location">Location *</label><input id="site-location" name="location" value="${value('location')}" maxlength="240" required></div>
          <div class="field"><label for="site-engineer">Engineer / Architect *</label><select id="site-engineer" name="assigned_engineer_id" required><option value="">Select an existing profile</option>${legacy ? `<option value="legacy" selected>${value('assigned_engineer')} (existing assignment)</option>` : ''}${state.profiles.map(profile => `<option value="${escape(profile.id)}"${profile.id === site?.assigned_engineer_id ? ' selected' : ''}>${escape(profile.name)}</option>`).join('')}</select>${!state.profiles.length ? '<small class="sites-muted">No accessible profiles. An Admin must add or make the actual Engineer / Architect profiles available before assigning a new project.</small>' : ''}</div>
          <div class="field"><label for="site-phase">Project Phase</label><input id="site-phase" name="phase" value="${value('phase')}" maxlength="80" placeholder="Enter the phase used by your team"><small class="sites-muted">Use your actual project terminology, or leave blank.</small></div>
          <div class="field"><label for="site-status">Status *</label><select id="site-status" name="status" required>${Object.entries(siteStatuses).map(([key, [label]]) => `<option value="${key}"${(site?.status || 'planning') === key ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
          <div class="field"><label for="site-progress">Completion (%) *</label><input id="site-progress" name="progress" type="number" value="${value('progress', 0)}" min="0" max="100" step="1" required></div>
          <div class="field full"><label for="site-check">Last Inventory Check</label><input id="site-check" name="last_inventory_check" type="date" value="${value('last_inventory_check')}" max="${today()}"></div>
        </div>
        <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Cancel</button><button type="submit" class="btn btn-primary">${site ? 'Save Changes' : 'Create Project'}</button></div>
      </form>`);
  }

  async function saveSite(form) {
    if (readOnly || isEngineer() || state.saving || state.loading || !form.reportValidity()) return;
    const original = state.sites.find(site => site.id === form.dataset.id);
    const values = Object.fromEntries(new FormData(form));
    const profile = state.profiles.find(profile => profile.id === values.assigned_engineer_id);
    if (values.assigned_engineer_id === 'legacy' && original) {
      values.assigned_engineer_id = original.assigned_engineer_id || null;
      values.assigned_engineer = original.assigned_engineer;
    } else if (profile) values.assigned_engineer = profile.name;
    else { formError('Select an existing Engineer / Architect profile.'); return; }
    values.phase = normalizeName(values.phase || '');
    for (const field of ['name', 'location', 'assigned_engineer']) {
      values[field] = normalizeName(values[field]);
      if (!values[field]) { formError('Please complete all required fields. Blank spaces are not valid values.'); return; }
    }
    if (state.sites.some(site => site.id !== original?.id && normalizeName(site.name).toLowerCase() === values.name.toLowerCase())) {
      formError('A site with this name already exists. Please use a different name.'); return;
    }
    values.progress = Number(values.progress);
    if (!Number.isInteger(values.progress) || values.progress < 0 || values.progress > 100) { formError('Completion must be a whole number from 0 to 100.'); return; }
    if (!(values.status in siteStatuses)) { formError('Please select a valid project status.'); return; }
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
      formError(databaseError(error, 'save'));
    } finally { setSaving(false); }
  }

  function setSaving(saving) {
    state.saving = saving;
    syncControls();
    dialog.setAttribute('aria-busy', String(saving));
    dialog.querySelectorAll('button, input, select').forEach(element => { element.disabled = saving; });
    const submit = dialog.querySelector('[type="submit"], [data-action="confirm-archive"]');
    if (submit) {
      if (saving) { submit.dataset.label = submit.textContent; submit.textContent = 'Saving…'; }
      else if (submit.dataset.label) submit.textContent = submit.dataset.label;
    }
  }

  function archiveSite() {
    if (readOnly || isEngineer()) return;
    const site = currentSite();
    if (!site) return;
    openDialog(site.is_active === false ? 'Restore Project' : 'Archive Project', `
      <div id="sites-form-error" class="sites-form-error hidden" role="alert" tabindex="-1"></div>
      <p class="sites-dialog-description">${site.is_active === false ? 'Restore' : 'Archive'} ${escape(site.name)}? Its equipment assignments and full history will remain available. Archiving does not transfer or return equipment.</p>
      <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog" autofocus>Cancel</button><button type="button" class="btn btn-primary" data-action="confirm-archive">${site.is_active === false ? 'Restore' : 'Archive'}</button></div>`);
  }

  async function confirmArchive() {
    if (readOnly || isEngineer() || state.saving) return;
    const site = currentSite();
    if (!site) return;
    setSaving(true);
    try {
      const restore = site.is_active === false;
      const saved = await repository.save({ is_active: restore, archived_at: restore ? null : new Date().toISOString() }, site);
      if (!root.isConnected) return;
      state.sites = state.sites.map(record => record.id === site.id ? saved : record);
      render();
      setSaving(false);
      closeDialog();
      showScreen('sites');
      feedback(`${site.name} ${saved.is_active === false ? 'archived' : 'restored'}. Its history has been preserved.`);
    } catch (error) { formError(databaseError(error, 'archive')); }
    finally { setSaving(false); }
  }

  function reviewTools() {
    const site = currentSite();
    if (!site) return;
    if (!dialog.open) state.review = { search: '', status: '' };
    openDialog(`Assigned Tools — ${site.name}`, `
      <p class="sites-dialog-description">Review the equipment assigned to this project, including zero-quantity records. Assignments and holders are read-only.</p>
      <div class="table-toolbar">
        <div class="field sites-review-search"><label for="sites-tool-search">Search equipment</label><input type="search" id="sites-tool-search" value="${escape(state.review.search)}" placeholder="Tool name, asset ID, brand or holder" autofocus></div>
        <div class="field"><label for="sites-tool-status">Status</label><select id="sites-tool-status" class="chip-filter"><option value="">All statuses</option>${Object.entries(toolStatuses).map(([key, [label]]) => `<option value="${key}"${state.review.status === key ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
      </div>
      <div id="sites-review-results" class="card" aria-live="polite"></div>
      <div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button></div>`, true, 'review');
    filterTools();
  }

  function filterTools() {
    const target = root.querySelector('#sites-review-results');
    if (!target || !currentSite()) return;
    const search = root.querySelector('#sites-tool-search').value.trim().toLowerCase();
    const status = root.querySelector('#sites-tool-status').value;
    state.review = { search: root.querySelector('#sites-tool-search').value, status };
    const items = siteEquipment(currentSite()).filter(item => (!status || item.status === status) && (!search || [item.name, item.asset_id, item.brand, item.holder, item.current_holder_id].some(value => String(value || '').toLowerCase().includes(search))));
    target.innerHTML = inventoryTable(items, search || status ? 'No equipment matches your filters.' : 'No equipment is currently assigned to this project.');
  }

  function movementTable(records) {
    if (records.error) return `<div class="empty-state"><p class="t">Movement history unavailable</p><p class="d">${escape(records.error)}</p></div>`;
    if (!records.length) return '<div class="empty-state sites-movement-empty"><p class="t">No movement records available</p><p class="d">Movement history will appear here when records are available. This view is read-only.</p></div>';
    return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Tool</th><th>From</th><th>To</th><th>Quantity</th></tr></thead><tbody>${records.map(record => `<tr><td>${escape(formatDate(record.date))}</td><td>${escape(record.asset_id)}</td><td>${escape(record.from)}</td><td>${escape(record.to)}</td><td>${escape(record.quantity)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function viewMovements() {
    const site = currentSite();
    if (!site) return;
    const records = await repository.movements(site.id).catch(error => ({error: databaseError(error, 'movements')}));
    if (!root.isConnected) return;
    openDialog(`Movement History — ${site.name}`, `<p class="sites-dialog-description">Equipment movement into and out of this project.</p><div class="card">${movementTable(records)}</div><div class="sites-dialog-actions"><button type="button" class="btn btn-secondary" data-action="close-dialog">Close</button></div>`, true);
  }

  async function viewTool(id) {
    const site = currentSite();
    const item = site && siteEquipment(site).find(record => record.id === id);
    if (!item) return;
    const fromReview = dialog.open && dialog.dataset.view === 'review';
    const records = await repository.movements(site.id, item.id).catch(error => ({error: databaseError(error, 'tool-movements')}));
    if (!root.isConnected) return;
    const fields = [['Asset ID', item.asset_id], ['Category', item.category], ['Brand', item.brand], ['Model', item.model], ['Serial Number', item.serial_number], ['Condition', item.condition], ['Tracking Type', item.tracking_type], ['Quantity', `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`], ['Current Project', site.name], ['Current Holder', item.holder], ['Identifying Details', item.details]];
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
      'archive-site': archiveSite, 'confirm-archive': confirmArchive,
      'project-history': async () => {
        const site = currentSite(); if (!site) return;
        try {
          const records = await repository.history(site.id);
          if (!root.isConnected) return;
          openDialog('Project History', records.length ? records.map(record => `<p>${escape(formatTimestamp(record.changed_at))} · ${escape(record.change_types.join(', '))}</p>`).join('') : '<p>No project changes recorded.</p>');
        } catch (error) { feedback(databaseError(error, 'history'), true); }
      },
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
  root.addEventListener('input', event => {
    if (event.target.id === 'sites-tool-search') filterTools();
    if (event.target.id === 'projects-search') { state.search = event.target.value.trim().toLowerCase(); render(); }
  });
  root.addEventListener('change', event => {
    if (event.target.id === 'sites-tool-status') filterTools();
    if (event.target.id === 'projects-scope' && !readOnly) { state.scope = event.target.value; render(); }
    if (event.target.id === 'projects-archived') { state.includeArchived = event.target.checked; render(); }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  const stopWatching = demo ? () => {} : window.EquipmentTracking.watch(() => refresh(true), message => {
    const label = root.querySelector('.inventory-sync'); if (label && !state.disposed) label.textContent = message;
  });
  window.MCPAProjects = {dispose() { state.disposed = true; stopWatching(); }};
  refresh();
})();
