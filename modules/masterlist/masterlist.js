/* The router loads this script once. Each mount owns its state and listeners. */
(function () {
  'use strict';
  let active;
  const labels = { AVAILABLE: 'Available', IN_USE: 'In Use', REPAIR: 'For Repair', MISSING: 'Missing' };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const status = value => { const key = String(value || 'AVAILABLE').toUpperCase().replace(/[ -]+/g, '_'); return ['FOR_REPAIR', 'UNDER_REPAIR'].includes(key) ? 'REPAIR' : key; };
  const date = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString() : '—';
  const node = (s, id) => s.root.querySelector('#' + id);
  const current = s => active === s && !s.controller.signal.aborted && (!s.context.isCurrent || s.context.isCurrent());
  function notice(s, message = '', error = false, target = 'masterlistFeedback') {
    if (!current(s)) return;
    const targetNode = node(s, target);
    targetNode.textContent = message; targetNode.hidden = !message; targetNode.classList.toggle('is-error', error);
  }
  function failure(error, action) {
    console.error('Masterlist ' + action, error);
    if (error?.code === '23503') return 'This item is linked to other records and must be kept to preserve its history.';
    if (error?.code === '23505') return 'That identifier is already in use. Please try again.';
    if (error?.code === '40001') return 'An active movement or another change prevents this update. Resolve the movement and refresh before retrying.';
    if (['42501', 'PGRST301'].includes(error?.code)) return 'Your account cannot make this change. Check your session and access.';
    if (error?.code === 'STALE') return 'The item changed or is no longer available. Refresh and try again.';
    return 'Could not ' + action + '. Check your connection and try again.';
  }
  async function read(s, table, columns = '*') {
    const rows = [];
    // Continue until empty, including when the API caps pages below 500 rows.
    for (let offset = 0; current(s); ) {
      let query = s.client.from(table).select(columns).order('id', { ascending: true }).range(offset, offset + 499);
      if (query.abortSignal) query = query.abortSignal(s.controller.signal);
      const result = await query;
      if (result.error) throw result.error;
      const page = result.data || [];
      rows.push(...page);
      if (!page.length) break;
      offset += page.length;
    }
    return rows;
  }
  function options(select, entries, placeholder, selected = select.value) {
    select.replaceChildren(new Option(placeholder, ''));
    entries.forEach(([value, label]) => select.add(new Option(label, value)));
    select.value = selected;
  }
  const categories = rows => [...new Set(rows.map(row => row.category).filter(value => typeof value === 'string' && value.trim()))].sort((a, b) => a.localeCompare(b));
  const siteName = (s, row) => row.site_id ? s.sites.find(site => site.id === row.site_id)?.name || 'Site unavailable' : 'Unassigned';
  function references(s) {
    const sites = s.sites.map(site => [site.id, site.name]);
    options(node(s, 'siteFilter'), [['__unassigned__', 'Unassigned'], ...sites], 'All sites');
    options(node(s, 'typeFilter'), [['__uncategorized__', 'Uncategorized'], ...categories(s.rows).map(name => [name, name])], 'All categories');
    options(node(s, 'equipmentSite'), sites, s.sites.length ? 'Unassigned' : 'No sites yet — unassigned');
    options(node(s, 'bulkLocationInput'), sites, 'Unassigned');
    options(node(s, 'equipmentCategory'), categories(s.rows).map(name => [name, name]), 'Select category');
    node(s, 'equipmentCategory').add(new Option('+ Add a category…', '__new__'));
  }
  async function refresh(s = active) {
    if (!s || !current(s) || s.loading) return;
    s.loading = true;
    notice(s);
    node(s, 'equipmentTableBody').innerHTML = '<tr><td colspan="10" class="masterlist-state">Loading equipment…</td></tr>';
    node(s, 'emptyState').classList.add('hidden');
    node(s, 'paginationContainer').style.display = 'none';
    node(s, 'openAddEquipment').disabled = true;
    try {
      const [rows, sites] = await Promise.all([read(s, 'equipment'), read(s, 'sites', 'id,name')]);
      if (!current(s)) return;
      s.rows = rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(a.id).localeCompare(String(b.id)));
      s.sites = sites.sort((a, b) => a.name.localeCompare(b.name));
      s.selected = new Set([...s.selected].filter(id => rows.some(row => row.id === id)));
      references(s); render(s);
      if (s.profileId) profile(s, s.profileId);
    } catch (error) {
      if (!current(s)) return;
      node(s, 'equipmentTableBody').innerHTML = '<tr><td colspan="10" class="masterlist-state">Equipment could not be loaded. Use Refresh to retry.</td></tr>';
      notice(s, failure(error, 'load equipment and sites'), true);
    } finally { if (current(s)) { s.loading = false; node(s, 'openAddEquipment').disabled = false; } }
  }
  function filtered(s) {
    const search = node(s, 'searchEquipment').value.trim().toLocaleLowerCase();
    const category = node(s, 'typeFilter').value, statusValue = node(s, 'statusFilter').value, site = node(s, 'siteFilter').value;
    return s.rows.filter(row => (!search || [row.asset_id, row.name, row.brand, row.model, row.serial_number, row.category, siteName(s, row)].some(value => String(value ?? '').toLocaleLowerCase().includes(search))) &&
      (!category || (category === '__uncategorized__' ? !row.category : row.category === category)) && (!statusValue || status(row.status) === statusValue) &&
      (!site || (site === '__unassigned__' ? !row.site_id : row.site_id === site)));
  }
  function badge(row) {
    const key = status(row.status), className = { AVAILABLE: 'available', IN_USE: 'inuse', REPAIR: 'repair', MISSING: 'missing' }[key] || 'neutral';
    return `<span class="badge badge-${className}">${escape(labels[key] || row.status || 'Unknown')}</span>`;
  }
  const button = (action, text, id = '', extra = '') => `<button type="button" class="btn btn-secondary btn-sm" data-action="${action}" data-id="${escape(id)}" ${extra}>${text}</button>`;
  function selection(s) {
    const boxes = [...s.root.querySelectorAll('.row-checkbox')], count = boxes.filter(box => box.checked).length;
    node(s, 'selectAll').checked = !!boxes.length && count === boxes.length;
    node(s, 'selectAll').indeterminate = count > 0 && count < boxes.length;
    node(s, 'bulkActionBar').style.display = s.selected.size ? 'flex' : 'none';
    node(s, 'selectedCount').textContent = s.selected.size;
  }
  function render(s) {
    if (!current(s)) return;
    const rows = filtered(s), size = Number(window.MCPA.getPreferences?.().pageSize) || 10, pages = Math.max(1, Math.ceil(rows.length / size));
    s.page = Math.max(1, Math.min(s.page, pages));
    const start = (s.page - 1) * size;
    node(s, 'equipmentTableBody').innerHTML = rows.slice(start, start + size).map(row => `<tr>
      <td><input type="checkbox" class="row-checkbox" value="${escape(row.id)}" aria-label="Select ${escape(row.asset_id)}" ${s.selected.has(row.id) ? 'checked' : ''}></td>
      <td><span class="tool-id-chip">${escape(row.asset_id || row.id)}</span></td><td><div class="cell-name">${escape(row.name)}</div><div class="cell-sub">${escape(row.model || '—')}</div></td>
      <td>${escape(row.category || 'Uncategorized')}</td><td>${escape(row.brand || '—')}</td><td>${escape(siteName(s, row))}</td><td>${badge(row)}</td><td>${escape(row.condition || 'Not assessed')}</td><td>${escape(date(row.created_at))}</td>
      <td><div class="masterlist-actions">${button('view', 'View', row.id)}${button('edit', 'Edit', row.id)}${button('delete', 'Delete', row.id)}</div></td></tr>`).join('');
    node(s, 'emptyState').classList.toggle('hidden', rows.length > 0);
    node(s, 'emptyState').querySelector('.d').textContent = s.rows.length ? 'Try adjusting your search or filters.' : 'Add an item to register equipment.';
    node(s, 'paginationContainer').style.display = rows.length ? 'flex' : 'none';
    node(s, 'paginationInfo').textContent = `Showing ${rows.length ? start + 1 : 0}–${Math.min(start + size, rows.length)} of ${rows.length} entries`;
    node(s, 'paginationControls').innerHTML = button('page', 'Previous', s.page - 1, s.page === 1 ? 'disabled' : '') + `<span class="masterlist-page">Page ${s.page} of ${pages}</span>` + button('page', 'Next', s.page + 1, s.page === pages ? 'disabled' : '');
    selection(s);
  }
  function view(s, name) {
    ['masterlist', 'tool-profile'].forEach(key => { node(s, 'screen-' + key).style.display = name === key ? 'block' : 'none'; node(s, 'screen-' + key).classList.toggle('active', name === key); });
    if (name === 'masterlist') s.profileId = null;
  }
  function profile(s, id) {
    const row = s.rows.find(item => item.id === id || item.asset_id === id);
    if (!row) { view(s, 'masterlist'); notice(s, 'This item is no longer available. Refresh the Masterlist.', true); return; }
    s.profileId = row.id;
    const fields = [['Asset ID', row.asset_id], ['Category', row.category], ['Brand', row.brand], ['Model', row.model], ['Serial number', row.serial_number], ['Condition', row.condition], ['Tracking type', row.tracking_type], ['Quantity', `${row.quantity ?? 1} ${row.unit || ''}`], ['Details', row.details], ['Site', siteName(s, row)], ['Holder reference', row.current_holder_id], ['Registered', date(row.created_at)]];
    node(s, 'profileContent').innerHTML = `<div class="page-head"><div><h1 class="display">${escape(row.name)}</h1><p class="sub">${escape(row.asset_id)}</p></div>${badge(row)}</div><div class="masterlist-profile"><div class="card card-pad"><h2>Equipment information</h2>${fields.map(([label, value]) => `<div class="masterlist-kv"><span>${label}</span><strong>${escape(value ?? '—')}</strong></div>`).join('')}</div><div class="card card-pad"><h2>Actions &amp; QR tag</h2><div class="masterlist-tag"><img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&amp;data=${encodeURIComponent(row.asset_id || row.id)}" alt="Equipment QR tag" width="120" height="120"><p>${escape(row.asset_id || row.id)}</p></div><div class="masterlist-actions">${button('edit', 'Edit item', row.id)}${button('print', 'Print tag', row.id)}${button('delete', 'Delete item', row.id)}</div><h2 style="margin-top:24px">Movement history</h2><div id="equipmentHistory" aria-live="polite">Loading history…</div><p class="sub">Full movement records are available in Activity Log.</p>${button('activity', 'View activity')}</div></div>`;
    view(s, 'tool-profile');
    loadHistory(s, row.id, node(s, 'equipmentHistory'));
  }
  async function loadHistory(s, id, container) {
    try {
      let query = s.client.from('equipment_history').select('id,action,created_at').eq('equipment_id', id).order('created_at', { ascending: false }).limit(20);
      if (query.abortSignal) query = query.abortSignal(s.controller.signal);
      const result = await query;
      if (result.error) throw result.error;
      if (!current(s) || s.profileId !== id || !container.isConnected) return;
      container.innerHTML = result.data?.length ? '<div class="timeline">' + result.data.map(row => `<div class="tl-item"><div class="tl-date">${escape(date(row.created_at))}</div><div class="tl-title">${escape(row.action || 'Movement recorded')}</div></div>`).join('') + '</div><p class="sub">Showing the latest 20 records at most.</p>' : '<p class="sub">No movement history has been recorded for this item.</p>';
    } catch (error) { if (current(s) && container.isConnected) container.textContent = failure(error, 'load movement history') + ' Reopen this item to retry.'; }
  }
  function busyForm(s, id, busy) { node(s, id).querySelectorAll('input,select,textarea,button').forEach(input => { input.disabled = busy; }); node(s, id).setAttribute('aria-busy', String(busy)); }
  function formChoices(s) {
    const bulk = node(s, 'trackingType').value === 'Bulk', adding = node(s, 'equipmentCategory').value === '__new__';
    ['quantityGroup', 'unitGroup'].forEach(id => { node(s, id).style.display = bulk ? 'block' : 'none'; });
    ['equipmentQuantity', 'equipmentUnit'].forEach(id => { node(s, id).required = bulk; });
    node(s, 'newCategoryGroup').hidden = !adding; node(s, 'newEquipmentCategory').required = adding;
  }
  function preserve(select, value) { if (value && ![...select.options].some(option => option.value === String(value))) select.add(new Option(value, value)); select.value = value ?? ''; }
  async function edit(s, id) {
    if (s.busy || s.loading) return;
    const row = id ? s.rows.find(item => item.id === id || item.asset_id === id) : null;
    if (id && !row) return notice(s, 'This item is no longer available.', true);
    s.editId = row?.id || null;
    s.editOriginal = row ? { ...row } : null;
    const sequence = ++s.formSequence;
    node(s, 'equipmentForm').reset(); notice(s, '', false, 'equipmentFormFeedback');
    node(s, 'modalTitle').textContent = row ? 'Edit item: ' + row.asset_id : 'Add new item'; node(s, 'modalSubmitBtn').textContent = row ? 'Update item' : 'Save item';
    const fields = { equipmentType: 'name', equipmentCategory: 'category', brand: 'brand', equipmentModel: 'model', serialNumber: 'serial_number', equipmentCondition: 'condition', trackingType: 'tracking_type', equipmentQuantity: 'quantity', equipmentUnit: 'unit', identifyingDetails: 'details', equipmentSite: 'site_id' };
    Object.entries(fields).forEach(([id, key]) => { const input = node(s, id), value = row?.[key] ?? ({ equipmentQuantity: 1, equipmentCondition: 'Good', trackingType: 'Individual' }[id] ?? ''); if (input.tagName === 'SELECT') preserve(input, value); else input.value = value; });
    formChoices(s); node(s, 'equipmentModal').style.display = 'flex'; s.formLoading = true; busyForm(s, 'equipmentForm', true);
    try {
      const [sites, rows] = await Promise.all([read(s, 'sites', 'id,name'), read(s, 'equipment', 'id,category')]);
      if (!current(s) || sequence !== s.formSequence) return;
      s.sites = sites.sort((a, b) => a.name.localeCompare(b.name));
      options(node(s, 'equipmentSite'), s.sites.map(site => [site.id, site.name]), sites.length ? 'Unassigned' : 'No sites yet — unassigned', row?.site_id || '');
      if (row?.site_id && !sites.some(site => site.id === row.site_id)) { node(s, 'equipmentSite').add(new Option('Assigned site unavailable', row.site_id)); node(s, 'equipmentSite').value = row.site_id; }
      options(node(s, 'equipmentCategory'), categories(rows).map(name => [name, name]), 'Select category', row?.category || '');
      node(s, 'equipmentCategory').add(new Option('+ Add a category…', '__new__')); if (row?.category) preserve(node(s, 'equipmentCategory'), row.category);
      s.formReady = true;
    } catch (error) { if (current(s) && sequence === s.formSequence) { s.formReady = false; notice(s, failure(error, 'load form choices') + ' Close and reopen the form to retry.', true, 'equipmentFormFeedback'); } }
    finally { if (current(s) && sequence === s.formSequence) { s.formLoading = false; busyForm(s, 'equipmentForm', false); node(s, 'modalSubmitBtn').disabled = !s.formReady; node(s, 'equipmentType').focus(); } }
  }
  function closeEditor(s) { if (s.busy) return; ++s.formSequence; s.formLoading = false; s.editId = null; node(s, 'equipmentModal').style.display = 'none'; }
  async function save(s, event) {
    event.preventDefault();
    if (s.busy || s.formLoading || !s.formReady || !node(s, 'equipmentForm').reportValidity()) return;
    const value = id => node(s, id).value.trim();
    let category = value('equipmentCategory') === '__new__' ? value('newEquipmentCategory').replace(/\s+/g, ' ') : value('equipmentCategory');
    category = categories(s.rows).find(name => name.toLowerCase() === category.toLowerCase()) || category;
    const bulk = value('trackingType') === 'Bulk', quantity = bulk ? Number(value('equipmentQuantity')) : 1;
    if (!value('equipmentType') || !category || category.length > 120 || !Number.isSafeInteger(quantity) || quantity < 0) return notice(s, 'Enter an item name, a category up to 120 characters, and a whole, nonnegative quantity.', true, 'equipmentFormFeedback');
    const payload = { name: value('equipmentType'), category, brand: value('brand') || null, model: value('equipmentModel') || null, serial_number: value('serialNumber') || null, condition: value('equipmentCondition'), tracking_type: value('trackingType'), quantity, unit: bulk ? value('equipmentUnit') : null, details: value('identifyingDetails') || null, site_id: value('equipmentSite') || null };
    const editing = s.editId;
    s.busy = true; busyForm(s, 'equipmentForm', true); notice(s, '', false, 'equipmentFormFeedback');
    try {
      let query = editing ? s.client.from('equipment').update(payload).eq('id', editing) : s.client.from('equipment').insert({ ...payload, asset_id: 'T-' + crypto.randomUUID().toUpperCase(), status: 'AVAILABLE' });
      // A movement completed while the editor was open must not be overwritten.
      if (editing) for (const key of ['status', 'site_id', 'current_holder_id', 'quantity']) {
        const original = s.editOriginal[key];
        query = original == null ? query.is(key, null) : query.eq(key, original);
      }
      const result = await query.select('id');
      if (result.error) throw result.error;
      if (result.data?.length !== 1) throw { code: 'STALE' };
      if (!current(s)) return;
      s.busy = false; closeEditor(s); await refresh(s);
      if (current(s) && !node(s, 'masterlistFeedback').classList.contains('is-error')) notice(s, editing ? 'Item updated.' : 'Item registered.');
    } catch (error) { notice(s, failure(error, 'save the item'), true, 'equipmentFormFeedback'); }
    finally { if (current(s)) { s.busy = false; busyForm(s, 'equipmentForm', false); } }
  }
  async function remove(s, id) {
    const row = s.rows.find(item => item.id === id);
    if (s.busy || !row || !window.confirm(`Delete ${row.name} (${row.asset_id})? This permanently removes the equipment record.`)) return;
    s.busy = true; s.root.querySelectorAll('[data-action="delete"]').forEach(input => { input.disabled = true; });
    try {
      const result = await s.client.from('equipment').delete().eq('id', id).select('id');
      if (result.error) throw result.error;
      if (result.data?.length !== 1) throw { code: 'STALE' };
      if (!current(s)) return;
      if (s.profileId === id) view(s, 'masterlist');
      await refresh(s);
      if (current(s) && !node(s, 'masterlistFeedback').classList.contains('is-error')) notice(s, 'Item deleted.');
    } catch (error) { notice(s, failure(error, 'delete the item'), true); }
    finally { if (current(s)) { s.busy = false; s.root.querySelectorAll('[data-action="delete"]').forEach(input => { input.disabled = false; }); } }
  }
  async function bulkDialog(s, mode) {
    if (!s.selected.size || s.busy) return;
    const sequence = ++s.bulkSequence;
    s.bulkMode = mode; s.bulkReady = true; node(s, 'bulkActionForm').reset(); notice(s, '', false, 'bulkFormFeedback');
    node(s, 'bulkModalTitle').textContent = `${mode === 'status' ? 'Update status' : 'Assign site'} (${s.selected.size} items)`;
    node(s, 'bulkStatusField').style.display = mode === 'status' ? 'block' : 'none'; node(s, 'bulkLocationField').style.display = mode === 'location' ? 'block' : 'none'; node(s, 'bulkStatusSelect').required = mode === 'status';
    node(s, 'bulkActionModal').style.display = 'flex'; busyForm(s, 'bulkActionForm', false);
    if (mode !== 'location') return;
    s.bulkLoading = true; busyForm(s, 'bulkActionForm', true);
    try {
      const sites = await read(s, 'sites', 'id,name');
      if (!current(s) || sequence !== s.bulkSequence) return;
      s.sites = sites.sort((a, b) => a.name.localeCompare(b.name)); options(node(s, 'bulkLocationInput'), s.sites.map(site => [site.id, site.name]), 'Unassigned');
    } catch (error) { if (current(s) && sequence === s.bulkSequence) { s.bulkReady = false; notice(s, failure(error, 'load sites') + ' Close and reopen to retry.', true, 'bulkFormFeedback'); } }
    finally { if (current(s) && sequence === s.bulkSequence) { s.bulkLoading = false; busyForm(s, 'bulkActionForm', false); node(s, 'bulkModalSubmitBtn').disabled = !s.bulkReady; } }
  }
  function closeBulk(s) { if (!s.busy) { ++s.bulkSequence; s.bulkLoading = false; node(s, 'bulkActionModal').style.display = 'none'; } }
  async function saveBulk(s, event) {
    event.preventDefault();
    if (s.busy || s.bulkLoading || !s.bulkReady || !s.selected.size || !node(s, 'bulkActionForm').reportValidity()) return;
    const ids = [...s.selected], payload = s.bulkMode === 'status' ? { status: node(s, 'bulkStatusSelect').value } : { site_id: node(s, 'bulkLocationInput').value || null };
    s.busy = true; busyForm(s, 'bulkActionForm', true);
    try {
      const result = await s.client.from('equipment').update(payload).in('id', ids).select('id');
      if (result.error) throw result.error;
      if (!current(s)) return;
      node(s, 'bulkActionModal').style.display = 'none'; s.selected.clear(); await refresh(s);
      if (current(s)) notice(s, result.data?.length === ids.length ? `${ids.length} items updated.` : `${result.data?.length || 0} of ${ids.length} items updated. Some records changed or are inaccessible.`, result.data?.length !== ids.length);
    } catch (error) { notice(s, failure(error, 'update selected items'), true, 'bulkFormFeedback'); }
    finally { if (current(s)) { s.busy = false; busyForm(s, 'bulkActionForm', false); } }
  }
  function print(s, title, body, qr = false) {
    const popup = window.open('', '_blank', 'width=900,height=650');
    if (!popup) return notice(s, 'Allow pop-ups to print or export this document.', true);
    popup.document.write(`<!doctype html><html><head><title>${escape(title)}</title><style>body{font:14px system-ui;padding:24px;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ccc;text-align:left}.tag{text-align:center}img{width:150px;height:150px}@media print{button{display:none}}</style></head><body>${body}<button type="button" id="print">Print</button></body></html>`); popup.document.close();
    popup.document.getElementById('print').onclick = () => popup.print();
    if (!qr) { popup.print(); return; }
    const image = popup.document.querySelector('img'); image.onload = () => popup.print(); image.onerror = () => { const warning = popup.document.createElement('p'); warning.textContent = 'The QR service is unavailable. Close this window and try again.'; popup.document.body.append(warning); }; if (image.complete && image.naturalWidth) popup.print();
  }
  function exportRows(s) {
    const rows = filtered(s);
    print(s, 'Equipment Masterlist', `<h1>Equipment Masterlist</h1><p>${escape(new Date().toLocaleString())} · ${rows.length} items</p><table><thead><tr>${['Asset ID', 'Item', 'Category', 'Site', 'Status', 'Condition', 'Quantity'].map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${[row.asset_id, row.name, row.category, siteName(s, row), labels[status(row.status)] || row.status, row.condition, `${row.quantity ?? 1} ${row.unit || ''}`].map(value => `<td>${escape(value || '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
  }
  function bind(s) {
    const signal = s.controller.signal;
    s.root.addEventListener('click', event => {
      const target = event.target.closest('button,[data-action]'); if (!target || target.disabled) return;
      const id = target.dataset.id;
      const actions = { refreshMasterlist: () => refresh(s), openAddEquipment: () => edit(s), closeEquipmentModal: () => closeEditor(s), cancelEquipmentModal: () => closeEditor(s), exportBtn: () => exportRows(s), btnBulkStatus: () => bulkDialog(s, 'status'), btnBulkLocation: () => bulkDialog(s, 'location'), btnBulkCancel: () => { s.selected.clear(); render(s); }, closeBulkModal: () => closeBulk(s), cancelBulkModal: () => closeBulk(s) };
      if (actions[target.id]) return actions[target.id]();
      switch (target.dataset.action) {
        case 'view': return profile(s, id);
        case 'edit': return edit(s, id);
        case 'delete': return remove(s, id);
        case 'page': s.page = Number(id); return render(s);
        case 'back': return view(s, 'masterlist');
        case 'activity': return window.showScreen('activity');
        case 'print': { const row = s.rows.find(item => item.id === id); if (row) print(s, 'Asset tag', `<div class="tag"><h1>${escape(row.name)}</h1><img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&amp;data=${encodeURIComponent(row.asset_id || row.id)}" alt="Equipment QR tag"><p>${escape(row.asset_id || row.id)}</p></div>`, true); }
      }
    }, { signal });
    s.root.addEventListener('input', event => { if (event.target.id === 'searchEquipment') { s.page = 1; render(s); } }, { signal });
    s.root.addEventListener('change', event => {
      const target = event.target;
      if (['siteFilter', 'typeFilter', 'statusFilter'].includes(target.id)) { s.page = 1; render(s); }
      if (['trackingType', 'equipmentCategory'].includes(target.id)) formChoices(s);
      if (target.classList.contains('row-checkbox')) { target.checked ? s.selected.add(target.value) : s.selected.delete(target.value); selection(s); }
      if (target.id === 'selectAll') { s.root.querySelectorAll('.row-checkbox').forEach(box => { box.checked = target.checked; target.checked ? s.selected.add(box.value) : s.selected.delete(box.value); }); selection(s); }
    }, { signal });
    s.root.addEventListener('keydown', event => { if (event.key === 'Escape' && !s.busy) { closeEditor(s); closeBulk(s); } }, { signal });
    node(s, 'equipmentForm').addEventListener('submit', event => save(s, event), { signal });
    node(s, 'bulkActionForm').addEventListener('submit', event => saveBulk(s, event), { signal });
  }
  function destroy() { if (active) active.controller.abort(); active = null; }
  window.MCPAModules = window.MCPAModules || {};
  window.MCPAModules.masterlist = { async init(context) { destroy(); const s = { context, root: context.root, client: window.MCPA.getClient(), controller: new AbortController(), rows: [], sites: [], selected: new Set(), page: 1, formSequence: 0, bulkSequence: 0 }; active = s; if (context.signal) context.signal.addEventListener('abort', () => s.controller.abort(), { once: true }); bind(s); await refresh(s); }, destroy };
  // Entry points used by the shared search and cross-module links.
  window.initMasterlist = () => refresh();
  window.filterMasterlist = window.filterAndResetPage = () => { if (active) { active.page = 1; render(active); } };
  window.showToolProfile = id => { if (active) profile(active, id); };
  window.showMasterlistView = name => { if (active) view(active, name); };
})();
