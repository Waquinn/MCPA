/* A fresh controller is created for each mount; leaving aborts its timer. */
window.MCPAModules = window.MCPAModules || {};
window.MCPAModules.consumables = { init(context) {
  'use strict';
  const root = document.getElementById('screen-consumables');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const dialog = $('#consumables-dialog');
  const state = { items: [], requests: [], ready: false, loading: false, saving: false, loadError: false };
  const statuses = { out: ['Out of Stock', 'low'], low: ['Low Stock', 'low'], ok: ['OK', 'ok'], pending: ['Pending', 'pending'], partial: ['Partially Received', 'inuse'], received: ['Received', 'verified'], cancelled: ['Cancelled', 'disposed'] };
  let returnFocus = null;
  let formContext = null;
  let dialogRevision = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const normalize = value => value.trim().replace(/\s+/g, ' ');
  const number = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const round = value => Math.round(value * 1000) / 1000;
  const isOpen = request => ['pending', 'partial'].includes(request.status);
  const openRequest = id => state.requests.find(request => request.consumable_id === id && isOpen(request));
  const itemById = id => state.items.find(item => item.id === id);
  const requestById = id => state.requests.find(request => request.id === id);
  const reference = request => `CR-${String(request.request_number).padStart(5, '0')}`;
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    return Array.from(bytes, (byte, index) => ([4, 6, 8, 10].includes(index) ? '-' : '') + byte.toString(16).padStart(2, '0')).join('');
  }
  function today() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const value = type => parts.find(part => part.type === type).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  function date(value, withTime = false) {
    if (!value) return 'Not specified';
    return new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value).toLocaleString('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
    });
  }
  function badge(status) {
    const [label, style] = statuses[status] || ['Unknown', 'disposed'];
    return `<span class="badge badge-${style}">${label}</span>`;
  }
  function button(action, label, id = '', style = 'secondary') {
    return `<button type="button" class="btn btn-${style} btn-sm" data-action="${action}" data-id="${escape(id)}">${label}</button>`;
  }
  function client() { return MCPA.getClient(); }
  function errorMessage(error) {
    if (['PGRST205', 'PGRST202', '42P01', '42703', '42883'].includes(error.code)) return 'Consumables database setup is incomplete. Ask your administrator to complete setup, then refresh.';
    if (error.code === '42501') return 'Consumables access is blocked by database permissions. Ask your administrator to apply the Consumables setup, then retry.';
    if (error.code === '23505') return error.message?.includes('open purchase') ? error.message : 'An item with this name or an open request for this item already exists. Check the existing records.';
    if (['23514', '23502', '22003'].includes(error.code)) return 'Check all required fields and quantities. Values must fit the allowed limits.';
    if (['PGRST301', 'PGRST303'].includes(error.code)) return 'Your database session is invalid or expired. Sign in again and retry.';
    return error.message || 'The database could not be reached. Please try again.';
  }
  async function readAll(table, itemId) {
    const rows = [];
    for (let offset = 0; ;) {
      let query = client().from(table).select('*', { count: 'exact' }).order('id').range(offset, offset + 499);
      if (itemId) query = query.eq('consumable_id', itemId);
      const { data, count, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data?.length || (count != null ? rows.length >= count : data.length < 500)) return rows;
      offset += data.length;
    }
  }
  async function loadData() {
    const [items, requests] = await Promise.all([readAll('consumables'), readAll('consumable_requests')]);
    if (!root.isConnected) return;
    state.items = items.sort((a, b) => a.name.localeCompare(b.name));
    state.requests = requests.sort((a, b) => Number(b.request_number) - Number(a.request_number));
    state.ready = true;
    state.loadError = false;
    $('#consumables-updated').textContent = `Last checked ${date(new Date().toISOString(), true)} (Manila). Checks every 30 seconds while this module is open.`;
  }
  function feedback(message, isError = false) {
    const element = $('#consumables-feedback');
    element.textContent = message;
    element.classList.toggle('hidden', !message);
    element.classList.toggle('is-error', isError);
    element.setAttribute('role', isError ? 'alert' : 'status');
  }
  function formError(message) {
    const element = $('#consumables-form-error');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('hidden', !message);
    if (message) element.focus();
  }
  function syncControls() {
    root.querySelectorAll('button[data-action]').forEach(control => {
      if (dialog.contains(control)) { control.disabled = state.saving; return; }
      control.disabled = state.loading || state.saving || (control.dataset.action !== 'refresh' && !state.ready);
      if (control.dataset.action === 'request' && !control.dataset.id) control.disabled ||= !state.items.some(item => !openRequest(item.id));
    });
    $('#consumables-inventory').setAttribute('aria-busy', String(state.loading || state.saving));
  }
  async function refresh(quiet = false) {
    if (state.loading || state.saving || dialog.open) return;
    state.loading = true;
    if (!quiet || state.loadError) feedback('');
    syncControls();
    try {
      await loadData();
      if (root.isConnected) render();
    } catch (error) {
      if (!root.isConnected) return;
      state.ready = false; state.loadError = true;
      feedback(errorMessage(error) + (state.items.length ? ' Displayed records may be out of date.' : ''), true);
      $('#consumables-alert').className = 'notice cons-alert';
      $('#consumables-alert').innerHTML = '<div><div class="t">Stock levels could not be verified</div><div class="d">Refresh to check the latest stock and purchase requests.</div></div>';
      if (!state.items.length) $('#consumables-rows').innerHTML = '<tr><td colspan="5" class="empty-state">Unable to load consumables. Use Refresh to try again.</td></tr>';
      if (!state.requests.length) $('#consumables-request-rows').innerHTML = '<tr><td colspan="6" class="empty-state">Unable to load purchase requests.</td></tr>';
    } finally { state.loading = false; syncControls(); }
  }
  function render() {
    const attention = state.items.filter(item => item.stock_status !== 'ok');
    const covered = attention.filter(item => openRequest(item.id)).length;
    const alert = $('#consumables-alert');
    alert.className = `notice cons-alert ${attention.length ? 'is-low' : state.items.length ? 'is-ok' : ''}`;
    alert.innerHTML = `<div><div class="t">${attention.length ? `${attention.length} consumable${attention.length === 1 ? '' : 's'} need${attention.length === 1 ? 's' : ''} restocking` : state.items.length ? 'All consumables meet their minimum stock levels' : 'Start monitoring your consumables'}</div><div class="d">${attention.length ? `${attention.filter(item => item.stock_status === 'out').length} out of stock. ${covered} covered by open requests. Purchase requests are recommended for the remaining ${attention.length - covered}.` : state.items.length ? 'Stock below the minimum or at zero will appear here. Open requests stay visible until received or cancelled.' : 'Add your materials, opening stock, and minimum levels to receive stock alerts.'}</div></div>`;
    renderItems(); renderRequests(); syncControls();
  }
  function renderItems() {
    const search = $('#consumables-search').value.trim().toLowerCase();
    const filter = $('#consumables-filter').value;
    const items = state.items.filter(item => `${item.name} ${item.unit}`.toLowerCase().includes(search) && (!filter || (filter === 'attention' ? item.stock_status !== 'ok' : item.stock_status === filter)));
    $('#consumables-count').textContent = `${items.length} of ${state.items.length} items`;
    $('#consumables-rows').innerHTML = items.length ? items.map(item => {
      const request = openRequest(item.id);
      return `<tr data-item-id="${escape(item.id)}"><td class="cell-name cons-item">${escape(item.name)}<div class="cell-sub">${escape(item.unit)}</div></td><td class="mono">${number(item.current_stock)}</td><td class="mono">${number(item.minimum_stock)}</td><td>${badge(item.stock_status)}${request ? `<div class="cell-sub">${reference(request)} · ${number(round(request.quantity - request.received_quantity))} outstanding</div>` : ''}</td><td><div class="cons-actions">${request ? button('view-request', 'View Request', request.id) : button('request', item.stock_status === 'ok' ? 'Request Stock' : 'Purchase Required', item.id)}${button('stock', 'Update Stock', item.id)}${button('edit', 'Edit', item.id)}${button('history', 'History', item.id)}</div></td></tr>`;
    }).join('') : `<tr><td colspan="5" class="empty-state">${state.items.length ? 'No consumables match your search or filter.' : 'No consumables yet. Add your first material to start monitoring stock.'}</td></tr>`;
    syncControls();
  }
  function renderRequests() {
    const filter = $('#consumables-request-filter').value;
    const requests = state.requests.filter(request => !filter || (filter === 'open' ? isOpen(request) : request.status === filter));
    $('#consumables-request-count').textContent = `${state.requests.filter(isOpen).length} open · ${state.requests.length} total`;
    $('#consumables-request-rows').innerHTML = requests.length ? requests.map(request => `<tr data-request-id="${escape(request.id)}"><td class="cons-item"><span class="mono">${reference(request)}</span><div class="cell-name">${escape(request.item_name)}</div></td><td class="mono">${number(request.quantity)} ${escape(request.unit)}</td><td class="mono">${number(request.received_quantity)}</td><td class="cons-item">${escape(request.requester)}<div class="cell-sub">${date(request.needed_by)}</div></td><td>${badge(request.status)}</td><td><div class="cons-actions">${button('view-request', 'View', request.id)}${isOpen(request) ? button('receive', 'Receive Stock', request.id) + button('cancel-request', 'Cancel', request.id) : ''}</div></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No purchase requests match this status.</td></tr>';
    syncControls();
  }
  function openDialog(title, content, context = null, wide = false) {
    if (!dialog.open) returnFocus = document.activeElement;
    dialogRevision++;
    formContext = context;
    $('#consumables-dialog-title').textContent = title;
    $('#consumables-dialog-content').innerHTML = content;
    dialog.classList.toggle('is-wide', wide);
    if (!dialog.open) dialog.showModal();
    (dialog.querySelector('[autofocus]') || dialog.querySelector('.cons-close')).focus();
  }
  function closeDialog() {
    if (state.saving) return;
    dialogRevision++; formContext = null; dialog.close();
    if (returnFocus?.isConnected) returnFocus.focus();
    else $('[data-action="add"]').focus();
  }
  function form(content, submitLabel) {
    return `<form id="consumables-form"><div id="consumables-form-error" class="cons-form-error hidden" role="alert" tabindex="-1"></div><div class="form-grid">${content}</div><div class="cons-dialog-actions">${button('close', 'Cancel')}<button type="submit" class="btn btn-primary">${submitLabel}</button></div></form>`;
  }
  function field(name, label, value = '', attributes = '', full = false) {
    return `<div class="field${full ? ' full' : ''}"><label for="cons-${name}">${label}</label><input id="cons-${name}" name="${name}" value="${escape(value)}" ${attributes}></div>`;
  }
  function note(name, label, value = '') {
    return `<div class="field full"><label for="cons-${name}">${label}</label><textarea id="cons-${name}" name="${name}" rows="3" maxlength="1000" required>${escape(value)}</textarea></div>`;
  }
  const numeric = 'type="number" min="0" max="999999999.999" step="0.001" required';
  function editItem(item = null) {
    openDialog(item ? 'Edit Consumable' : 'Add Consumable', `<p class="cons-description">${item ? 'Update the item name and minimum stock. Record quantity changes with Update Stock. Units stay fixed to preserve stock history.' : 'Enter actual opening stock. Required fields are marked *. Quantities support up to three decimal places.'}</p>` + form(
      field('name', 'Item name *', item?.name, 'maxlength="120" required autofocus', true) +
      field('unit', 'Unit *', item?.unit, `maxlength="30" placeholder="e.g. pieces, kg, rolls" required ${item ? 'readonly' : ''}`) +
      field('minimum', 'Minimum stock *', item?.minimum_stock ?? 0, numeric) +
      (item ? '' : field('opening', 'Opening stock *', 0, numeric)), item ? 'Save Changes' : 'Add Consumable'),
    { type: 'item', item, id: item?.id || uuid() });
  }
  function stockForm(item) {
    openDialog('Update Stock', `<p class="cons-description">${escape(item.name)} · Available: ${number(item.current_stock)} ${escape(item.unit)}.${openRequest(item.id) ? ' An open purchase request exists. Use Receive Stock on that request to record its delivery.' : ''}</p>` + form(
      '<div class="field full"><label for="cons-kind">Change type *</label><select id="cons-kind" name="kind"><option value="usage">Record usage</option><option value="restock">Restock without a request</option><option value="correction">Correct physical count</option></select></div>' +
      field('quantity', 'Quantity used *', '', numeric + ' autofocus', true) + note('note', 'Reason / reference *') +
      '<p id="cons-stock-preview" class="cons-muted full" aria-live="polite"></p>', 'Save Stock Change'), { type: 'stock', item, operationId: uuid() });
    stockPreview();
  }
  function stockPreview() {
    const kind = $('#cons-kind').value;
    const input = $('#cons-quantity');
    $('label[for="cons-quantity"]').textContent = ({ usage: 'Quantity used *', restock: 'Quantity added *', correction: 'Correct total stock *' })[kind];
    input.min = kind === 'correction' ? '0' : '0.001';
    input.max = kind === 'usage' ? formContext.item.current_stock : kind === 'restock' ? round(999999999.999 - Number(formContext.item.current_stock)) : '999999999.999';
    const quantity = Number(input.value);
    const balance = round(kind === 'correction' ? quantity : Number(formContext.item.current_stock) + (kind === 'usage' ? -quantity : quantity));
    $('#cons-stock-preview').textContent = input.value ? `Stock after change: ${number(balance)} ${formContext.item.unit}` : 'Enter a quantity to preview the new stock level.';
  }
  function requestForm(item) {
    if (item && openRequest(item.id)) return viewRequest(openRequest(item.id));
    const available = state.items.filter(entry => !openRequest(entry.id));
    if (!available.length) return feedback('All consumables already have open requests. View a request below.');
    openDialog('Purchase Request', '<p class="cons-description">Request stock for one consumable. Submitting a request does not change available stock. Required fields are marked *.</p>' + form(
      `<div class="field full"><label for="cons-item">Consumable *</label><select id="cons-item" name="item" required autofocus>${available.map(entry => `<option value="${escape(entry.id)}"${entry.id === item?.id ? ' selected' : ''}>${escape(entry.name)} (${escape(entry.unit)})</option>`).join('')}</select></div>` +
      '<p id="cons-request-hint" class="cons-muted full"></p>' +
      field('quantity', 'Quantity requested *', '', numeric.replace('min="0"', 'min="0.001"')) +
      field('needed', 'Needed by', '', `type="date" min="${today()}"`) +
      field('requester', 'Requested by *', '', 'maxlength="120" required', true) + note('purpose', 'Purpose *'), 'Submit Request'), { type: 'request', id: uuid() });
    requestSuggestion();
  }
  function requestSuggestion() {
    const item = itemById($('#cons-item').value);
    const shortage = round(Math.max(0, Number(item.minimum_stock) - Number(item.current_stock)));
    $('#cons-quantity').value = shortage || 1;
    $('#cons-purpose').value = item.stock_status !== 'ok' ? `Restock ${item.name} to maintain material availability.` : '';
    $('#cons-request-hint').textContent = `Available: ${number(item.current_stock)} ${item.unit}. Minimum: ${number(item.minimum_stock)}. Suggested quantity: ${number(shortage || 1)}; adjust to your actual requirement.`;
  }
  function viewRequest(request) {
    const details = [ ['Item', request.item_name], ['Requested', `${number(request.quantity)} ${request.unit}`], ['Received', `${number(request.received_quantity)} ${request.unit}`], ['Outstanding', `${number(round(request.quantity - request.received_quantity))} ${request.unit}`], ['Requested by', request.requester], ['Created', date(request.created_at, true)], ['Needed by', date(request.needed_by)], ['Purpose', request.purpose] ];
    if (request.cancellation_reason) details.push(['Cancellation reason', request.cancellation_reason]);
    openDialog(reference(request), badge(request.status) + details.map(([label, value]) => `<div class="kv"><span class="k">${label}</span><span class="v">${escape(value)}</span></div>`).join('') +
      `<div class="cons-dialog-actions">${button('history', 'Stock History', request.consumable_id)}${isOpen(request) ? button('cancel-request', 'Cancel Request', request.id) + button('receive', 'Receive Stock', request.id, 'primary') : button('close', 'Close')}</div>`);
  }
  function receiveForm(request) {
    const outstanding = round(request.quantity - request.received_quantity);
    openDialog('Receive Stock', `<p class="cons-description">${reference(request)} · ${escape(request.item_name)}. Outstanding: ${number(outstanding)} ${escape(request.unit)}. Record only the quantity delivered; it will be added to available stock.</p>` + form(
      field('quantity', 'Quantity received *', outstanding, `type="number" min="0.001" max="${outstanding}" step="0.001" required autofocus`, true) + note('note', 'Delivery reference / notes *'), 'Confirm Receipt'), { type: 'receive', request, operationId: uuid() });
  }
  function cancelForm(request) {
    openDialog('Cancel Purchase Request', `<p class="cons-description">Cancel the outstanding ${number(round(request.quantity - request.received_quantity))} ${escape(request.unit)} for ${reference(request)}? Already received stock and the request history will be retained.</p>` + form(note('reason', 'Cancellation reason *'), 'Confirm Cancellation'), { type: 'cancel', request });
  }
  async function history(item) {
    openDialog(`Stock History · ${item.name}`, '<p class="cons-description">Loading stock history…</p>', null, true);
    const revision = dialogRevision;
    try {
      const movements = await readAll('consumable_stock_movements', item.id);
      if (!root.isConnected || !dialog.open || revision !== dialogRevision) return;
      movements.sort((a, b) => b.created_at.localeCompare(a.created_at));
      $('#consumables-dialog-content').innerHTML = `<p class="cons-description">Quantities in ${escape(item.unit)}. Dates use Manila time.</p><div class="table-wrap"><table><thead><tr><th>Date</th><th>Change</th><th>Quantity</th><th>Balance</th><th>Reason / Reference</th></tr></thead><tbody>${movements.length ? movements.map(movement => `<tr><td>${date(movement.created_at, true)}</td><td>${escape(({ opening: 'Opening stock', usage: 'Usage', restock: 'Restock', correction: 'Correction', receipt: 'Request receipt' })[movement.kind])}</td><td class="mono">${movement.quantity_change > 0 ? '+' : ''}${number(movement.quantity_change)}</td><td class="mono">${number(movement.balance_after)}</td><td class="cons-item">${escape(movement.note)}${movement.request_id && requestById(movement.request_id) ? `<div class="cell-sub">${reference(requestById(movement.request_id))}</div>` : ''}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No stock movements recorded.</td></tr>'}</tbody></table></div><div class="cons-dialog-actions">${button('close', 'Close')}</div>`;
    } catch (error) {
      if (root.isConnected && dialog.open && revision === dialogRevision) $('#consumables-dialog-content').innerHTML = `<p role="alert" class="cons-form-error">${escape(errorMessage(error))}</p><div class="cons-dialog-actions">${button('history', 'Try Again', item.id)}${button('close', 'Close')}</div>`;
    }
  }
  function quantity(formData, key) {
    const raw = String(formData.get(key) ?? '');
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value) || value < 0 || value > 999999999.999 || Math.abs(value * 1000 - Math.round(value * 1000)) > 0.0001) throw new Error('Enter valid quantities with up to three decimal places.');
    return value;
  }
  function payload(formData, context) {
    const text = name => String(formData.get(name) || '').trim();
    for (const input of $('#consumables-form').querySelectorAll('input[required]:not([type="number"]), textarea[required]')) {
      if (!normalize(input.value)) throw new Error('Required fields cannot contain only blank spaces.');
    }
    if (context.type === 'item') {
      const name = normalize(text('name'));
      if (state.items.some(item => item.id !== context.id && normalize(item.name).toLowerCase() === name.toLowerCase())) throw new Error('A consumable with this name already exists.');
      return ['consumables_save_item', { p_id: context.id, p_version: context.item?.version ?? null, p_name: name, p_unit: normalize(text('unit')), p_minimum: quantity(formData, 'minimum'), p_opening: context.item ? 0 : quantity(formData, 'opening') }, 'Consumable saved.'];
    }
    if (context.type === 'stock') return ['consumables_adjust_stock', { p_operation_id: context.operationId, p_item_id: context.item.id, p_version: context.item.version, p_kind: text('kind'), p_quantity: quantity(formData, 'quantity'), p_note: text('note') }, 'Stock updated.'];
    if (context.type === 'request') {
      if (text('needed') && text('needed') < today()) throw new Error('Needed-by date cannot be in the past.');
      if (openRequest(text('item'))) throw new Error('This consumable already has an open purchase request.');
      return ['consumables_create_request', { p_id: context.id, p_item_id: text('item'), p_quantity: quantity(formData, 'quantity'), p_requester: text('requester'), p_purpose: text('purpose'), p_needed_by: text('needed') || null }, 'Purchase request submitted.'];
    }
    if (context.type === 'receive') return ['consumables_receive_request', { p_operation_id: context.operationId, p_request_id: context.request.id, p_version: context.request.version, p_quantity: quantity(formData, 'quantity'), p_note: text('note') }, 'Delivery recorded and stock updated.'];
    return ['consumables_cancel_request', { p_request_id: context.request.id, p_version: context.request.version, p_reason: text('reason') }, 'Purchase request cancelled.'];
  }
  async function submit(event) {
    event.preventDefault();
    if (state.saving || !formContext || !event.target.reportValidity()) return;
    let operation;
    try { operation = payload(new FormData(event.target), formContext); } catch (error) { formError(error.message); return; }
    const [rpc, parameters, success] = operation;
    formError(''); state.saving = true; syncControls();
    const controls = [...event.target.querySelectorAll('input, select, textarea, button')];
    controls.forEach(control => { control.disabled = true; });
    event.target.setAttribute('aria-busy', 'true');
    let committed = false;
    try {
      const { data, error } = await client().rpc(rpc, parameters);
      if (error) throw error;
      if (!data) throw new Error('The server did not confirm the save. Retry this form or refresh to check the result.');
      committed = true;
      await loadData();
      if (!root.isConnected) return;
      render(); feedback(success);
    } catch (error) {
      if (!root.isConnected) return;
      if (committed) {
        state.ready = false; state.loadError = true;
        feedback(`${success} The latest records could not be loaded. Refresh to verify stock levels.`, true);
        $('#consumables-alert').className = 'notice cons-alert';
        $('#consumables-alert').innerHTML = '<div><div class="t">Stock levels need refreshing</div><div class="d">Your change was saved. Refresh to load the updated records.</div></div>';
      } else formError(errorMessage(error));
    } finally {
      state.saving = false;
      controls.forEach(control => { control.disabled = false; });
      event.target.setAttribute('aria-busy', 'false');
      if (committed && root.isConnected) closeDialog();
      syncControls();
    }
  }
  root.addEventListener('click', event => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled || state.saving) return;
    const { action, id } = control.dataset;
    if (action === 'close') return closeDialog();
    if (action === 'refresh') return refresh();
    if (!state.ready || state.loading) return;
    const item = itemById(id); const request = requestById(id);
    if (action === 'add') editItem();
    else if (action === 'request') requestForm(item);
    else if (action === 'edit' && item) editItem(item);
    else if (action === 'stock' && item) stockForm(item);
    else if (action === 'history' && item) history(item);
    else if (action === 'view-request' && request) viewRequest(request);
    else if (action === 'receive' && request && isOpen(request)) receiveForm(request);
    else if (action === 'cancel-request' && request && isOpen(request)) cancelForm(request);
  });
  root.addEventListener('submit', event => { if (event.target.id === 'consumables-form') submit(event); });
  root.addEventListener('input', event => {
    if (event.target.id === 'consumables-search') renderItems();
    if (event.target.id === 'cons-quantity' && formContext?.type === 'stock') stockPreview();
  });
  root.addEventListener('change', event => {
    if (event.target.id === 'consumables-filter') renderItems();
    if (event.target.id === 'consumables-request-filter') renderRequests();
    if (event.target.id === 'cons-kind') stockPreview();
    if (event.target.id === 'cons-item') requestSuggestion();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  // Do not accumulate timers when the application replaces this module's markup.
  const timer = setInterval(() => {
    if (root.isConnected && root.classList.contains('active') && !document.hidden) refresh(true);
  }, 30000);
  context.signal.addEventListener('abort', () => { clearInterval(timer); dialogRevision++; if (dialog.open) dialog.close(); }, { once: true });
  return refresh();
} };
