(function () {
  'use strict';
  let context, revision = 0, data, errors, page = 1, busy = false, loading = false, createId, action = null, filtered = [];
  const R = () => window.MCPARecords;
  const q = selector => context.root.querySelector(selector);
  const size = () => window.MCPA.getPreferences?.().pageSize || 25;
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function message(text) { q('#purchase-status').textContent = text; }
  function closeAction() {
    action = null; q('#purchase-action-form').hidden = true; q('#purchase-action-empty').hidden = false;
  }
  function render() {
    const search = q('#purchase-search').value.toLowerCase().trim(), filter = q('#purchase-filter').value;
    filtered = data.consumable_requests.filter(row => (!filter || row.status === filter) && [row.item_name,row.requester,row.request_number,row.purpose].some(value => String(value ?? '').toLowerCase().includes(search))).sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
    page = Math.max(1,Math.min(page,Math.ceil(filtered.length / size()) || 1));
    const esc = R().esc;
    q('#purchase-rows').innerHTML = filtered.slice((page-1)*size(),page*size()).map(row => '<tr><td>' + esc(R().requestReference(row)) + '</td><td>' + esc(row.item_name) + '<div class="cell-sub">' + esc(row.requester) + '</div></td><td>' + esc(row.quantity) + ' / ' + esc(row.received_quantity) + ' ' + esc(row.unit) + '</td><td>' + esc(R().date(row.needed_by)) + '</td><td>' + esc(R().status(row.status)) + '</td><td>' + (['pending','partial'].includes(row.status) ? '<button class="btn btn-secondary btn-sm" data-receive="' + esc(row.id) + '"' + (busy || loading ? ' disabled' : '') + '>Receive</button> <button class="btn btn-secondary btn-sm" data-cancel="' + esc(row.id) + '"' + (busy || loading ? ' disabled' : '') + '>Cancel</button>' : esc(row.cancellation_reason || 'Closed')) + '</td></tr>').join('') || '<tr><td colspan="6" class="empty-state">' + (errors.consumable_requests ? 'Purchase requests could not be loaded.' : 'No matching purchase requests.') + '</td></tr>';
    q('#purchase-count').textContent = filtered.length + ' requests';
    q('#purchase-page').textContent = 'Page ' + page + ' of ' + (Math.ceil(filtered.length / size()) || 1);
    q('[data-action="previous"]').disabled = page <= 1;
    q('[data-action="next"]').disabled = page * size() >= filtered.length;
    q('[data-action="export"]').disabled = loading || !filtered.length || !!errors.consumable_requests;
    const requests = R().map(data.consumable_requests), items = R().map(data.consumables);
    const receipts = data.consumable_stock_movements.filter(row => row.kind === 'receipt').sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0,25);
    q('#purchase-receipts').innerHTML = receipts.map(row => '<tr><td>' + esc(requests.get(String(row.request_id)) ? R().requestReference(requests.get(String(row.request_id))) : row.request_id || '—') + '</td><td>' + esc(items.get(String(row.consumable_id))?.name || row.consumable_id) + '</td><td>' + esc(row.quantity_change) + ' ' + esc(items.get(String(row.consumable_id))?.unit || '') + '</td><td>' + esc(row.note) + '</td><td>' + esc(R().date(row.created_at)) + '</td></tr>').join('') || '<tr><td colspan="5" class="empty-state">' + (errors.consumable_stock_movements ? 'Receipt history could not be loaded.' : 'No receipts have been recorded.') + '</td></tr>';
  }
  function fields() {
    q('#purchase-fields').disabled = busy || loading || !!errors.consumables || !!errors.consumable_requests || !data.consumables.length;
    q('#purchase-action-fields').disabled = busy || loading;
    q('[data-action="refresh"]').disabled = busy || loading;
  }
  async function load() {
    const local = context, token = ++revision;
    loading = true; fields(); render();
    message('Loading purchase requests…');
    const result = await R().readSources(['consumables','consumable_requests','consumable_stock_movements']);
    if (!local.isCurrent() || token !== revision) return false;
    data = result.data; errors = result.errors; loading = false;
    const selected = q('#purchase-item').value;
    const open = new Set(data.consumable_requests.filter(row => ['pending','partial'].includes(row.status)).map(row => String(row.consumable_id)));
    q('#purchase-item').innerHTML = '<option value="">Select a consumable</option>' + data.consumables.map(row => '<option value="' + R().esc(row.id) + '"' + (open.has(String(row.id)) ? ' disabled' : '') + '>' + R().esc(row.name + ' (' + row.unit + ')' + (open.has(String(row.id)) ? ' — request already open' : '')) + '</option>').join('');
    if (data.consumables.some(row => row.id === selected) && !open.has(String(selected))) q('#purchase-item').value = selected;
    q('#purchase-unit').textContent = data.consumables.find(row => row.id === q('#purchase-item').value)?.unit || '';
    fields(); render();
    message(R().readableErrors(errors) || (!data.consumables.length ? 'Add an item in Consumables before making a purchase request.' : 'Purchase requests are up to date.'));
    return true;
  }
  function openAction(id, kind) {
    const row = data.consumable_requests.find(item => item.id === id);
    if (!row || busy || loading || !['pending','partial'].includes(row.status)) return;
    action = { row, kind, operationId: crypto.randomUUID() };
    q('#purchase-action-form').reset();
    q('#purchase-action-form').hidden = false; q('#purchase-action-empty').hidden = true;
    q('#purchase-action-title').textContent = (kind === 'receive' ? 'Receive ' : 'Cancel ') + R().requestReference(row);
    const remaining = Number((Number(row.quantity) - Number(row.received_quantity)).toFixed(3));
    q('#purchase-action-detail').textContent = row.item_name + ' — ' + remaining + ' ' + row.unit + ' outstanding.';
    q('#purchase-receive-field').hidden = kind !== 'receive';
    q('#purchase-receive-quantity').required = kind === 'receive';
    q('#purchase-receive-quantity').value = remaining;
    q('#purchase-receive-quantity').max = remaining;
    q('#purchase-action-note-label').textContent = kind === 'receive' ? 'Receipt note' : 'Cancellation reason';
    q('#purchase-confirm').textContent = kind === 'receive' ? 'Receive stock' : 'Cancel request';
    q('#purchase-action-form').scrollIntoView({block:'nearest',behavior:'smooth'});
    q(kind === 'receive' ? '#purchase-receive-quantity' : '#purchase-action-note').focus();
  }
  async function save(event, isAction) {
    event.preventDefault();
    if (busy || loading || !event.target.reportValidity()) return;
    const form = new FormData(event.target), local = context, activeAction = action;
    let rpc, args;
    if (isAction) {
      if (!activeAction) return;
      const note = String(form.get('note') || '').trim();
      if (!note) { message('Enter a receipt note or cancellation reason.'); return; }
      if (activeAction.kind === 'receive') {
        const amount = Number(form.get('received'));
        const remaining = Number((Number(activeAction.row.quantity) - Number(activeAction.row.received_quantity)).toFixed(3));
        if (!Number.isFinite(amount) || amount <= 0 || amount > remaining || Math.abs(amount*1000-Math.round(amount*1000)) > 0.0001) { message('Enter a positive received quantity within the outstanding amount, with at most three decimals.'); return; }
        rpc = 'consumables_receive_request';
        args = { p_operation_id:activeAction.operationId,p_request_id:activeAction.row.id,p_version:activeAction.row.version,p_quantity:amount,p_note:note };
      } else {
        rpc = 'consumables_cancel_request';
        args = {p_request_id:activeAction.row.id,p_version:activeAction.row.version,p_reason:note};
      }
    } else {
      const item = String(form.get('item') || ''), amount = Number(form.get('quantity'));
      const requester = String(form.get('requester') || '').trim(), purpose = String(form.get('purpose') || '').trim(), needed = form.get('needed') || null;
      if (!data.consumables.some(row => row.id === item) || !requester || !purpose || !Number.isFinite(amount) || amount <= 0 || amount >= 1000000000 || Math.abs(amount*1000-Math.round(amount*1000)) > 0.0001 || (needed && needed < today())) { message('Check the item, requester, purpose, quantity and needed-by date.'); return; }
      rpc = 'consumables_create_request';
      args = {p_id:createId,p_item_id:item,p_quantity:amount,p_requester:requester,p_purpose:purpose,p_needed_by:needed};
    }
    busy = true; fields(); render(); message('Saving…');
    try {
      const {error} = await window.MCPA.getClient().rpc(rpc,args);
      if (error) throw error;
      if (!local.isCurrent()) return;
      if (isAction) closeAction();
      else { q('#purchase-form').reset(); createId = crypto.randomUUID(); }
      busy = false;
      await load();
      if (local.isCurrent()) {
        const success = !isAction ? 'Purchase request saved.' : activeAction.kind === 'receive' ? 'Delivery recorded. Stock updated.' : 'Purchase request cancelled.';
        message(Object.keys(errors).length ? success + ' ' + R().readableErrors(errors) : success);
      }
    } catch (error) {
      console.error('Purchase operation failed',error);
      if (!local.isCurrent()) return;
      message(window.MCPA.errorMessage(error,'Could not save. Refresh to check the latest records before retrying.'));
    } finally {
      if (local.isCurrent()) { busy = false; fields(); render(); }
    }
  }
  window.MCPAModules = window.MCPAModules || {};
  window.MCPAModules.purchases = {
    init(next) {
      context = next; data = {consumables:[],consumable_requests:[],consumable_stock_movements:[]}; errors = {}; page = 1; busy = false; loading = false; action = null; createId = crypto.randomUUID();
      q('#purchase-date').min = today();
      q('#purchase-form').addEventListener('submit',event => save(event,false),{signal:next.signal});
      q('#purchase-action-form').addEventListener('submit',event => save(event,true),{signal:next.signal});
      q('#purchase-form').addEventListener('reset',() => { createId = crypto.randomUUID(); q('#purchase-unit').textContent = ''; },{signal:next.signal});
      q('#purchase-item').addEventListener('change',() => { q('#purchase-unit').textContent = data.consumables.find(row => row.id === q('#purchase-item').value)?.unit || ''; },{signal:next.signal});
      ['#purchase-search','#purchase-filter'].forEach(selector => q(selector).addEventListener('input',() => {page=1;render();},{signal:next.signal}));
      next.root.addEventListener('click',event => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (button.dataset.receive) return openAction(button.dataset.receive,'receive');
        if (button.dataset.cancel) return openAction(button.dataset.cancel,'cancel');
        if (button.dataset.action === 'refresh') { closeAction(); load(); }
        if (button.dataset.action === 'close-action' && !busy) closeAction();
        if (button.dataset.action === 'previous') {page--;render();}
        if (button.dataset.action === 'next') {page++;render();}
        if (button.dataset.action === 'export') R().download('purchase-requests',['Request','Item','Quantity','Received','Unit','Requester','Purpose','Needed by','Status','Created'],filtered.map(row => [R().requestReference(row),row.item_name,row.quantity,row.received_quantity,row.unit,row.requester,row.purpose,row.needed_by,row.status,row.created_at]));
      },{signal:next.signal});
      return load();
    },
    destroy() {revision++;context=null;action=null;}
  };
})();
