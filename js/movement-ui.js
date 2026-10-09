(function () {
  'use strict';

  const TITLES = { request: 'Requests', transfer: 'Transfers', return: 'Returns', repair: 'Repairs', missing: 'Missing tools' };
  const COLLECTIONS = { request: 'requests', transfer: 'transfers', return: 'returns', repair: 'repairs', missing: 'missing' };
  const STATUS = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', released: 'Released', received: 'Inspected / completed', discrepancy: 'Receipt discrepancy', reported: 'Reported', underrepair: 'Under repair', completed: 'Completed', missing: 'Missing', recovered: 'Recovered', available: 'Available', inuse: 'In use', repair: 'For repair', returned: 'Returned' };
  let current = null;
  let generation = 0;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = () => window.MovementStore;
  const state = () => store().getState();
  const context = () => store().getContext();
  const admin = () => context().role === 'admin';
  const operational = () => ['engineer','architect'].includes(context().role);
  const handler = () => context().role === 'tool_handler';
  const mode = () => typeof store().getMode === 'function' ? store().getMode() : (store().mode || state().mode || 'live');
  const tools = () => state().tools || [];
  const toolById = id => tools().find(tool => tool.id === id);
  const ids = record => record.toolIds || (record.toolId ? [record.toolId] : []);
  const recordStatus = record => record.status || 'returned';
  const date = value => { const d = new Date(value); return value && !isNaN(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'; };
  const button = (label, action, id, style) => `<button type="button" class="btn ${style || 'btn-secondary'} btn-sm" data-action="${esc(action)}"${id ? ` data-id="${esc(id)}"` : ''}>${esc(label)}</button>`;
  const badge = (status, kind) => {
    const tones = { pending: 'pending', approved: 'verified', rejected: 'discrepancy', discrepancy: 'discrepancy', released: 'inuse', received: 'verified', reported: 'repair', underrepair: 'underrepair', completed: 'verified', missing: 'missing', recovered: 'verified', returned: 'verified' };
    return `<span class="badge badge-${tones[status] || 'pending'}">${esc(kind === 'transfer' && status === 'pending' ? 'Awaiting receipt' : STATUS[status] || status)}</span>`;
  };
  const toolNames = record => ids(record).map(id => { const tool = toolById(id); return tool ? `${tool.name} (${id})` : id; }).join(', ');

  function visibleRecords() {
    const records = state()[COLLECTIONS[current.kind]] || [];
    const name = context().name;
    if (mode() === 'live' || admin() || handler()) return records;
    return records.filter(record => [record.requester, record.receiver, record.sender, record.returnedBy, record.reportedBy].includes(name) || (record.toolId && toolById(record.toolId)?.holder === name));
  }

  function eligibleTools(kind) {
    const locked = new Set((state().transfers || []).filter(t => t.status === 'pending').flatMap(ids));
    const reserved = new Set((state().requests || []).filter(r => r.status === 'approved').flatMap(ids));
    return tools().filter(tool => {
      if (locked.has(tool.id) || reserved.has(tool.id) || !(tool.qty > 0)) return false;
      const owns = mode() === 'live' ? tool.holderId === context().id : tool.holder === context().name;
      if (kind === 'request') return tool.status === 'available';
      if (kind === 'transfer') return (handler() && tool.status === 'available' && (!tool.holder || tool.holder === '?')) || (tool.status === 'inuse' && owns);
      if (kind === 'repair' || kind === 'missing') return (tool.status === 'inuse' && owns) || (admin() && tool.status === 'available');
      return tool.status === 'inuse' && owns;
    });
  }

  function siteField(name, label, required, value) {
    const sites = [...new Set([...(state().sites || []).map(site => typeof site === 'string' ? site : site.name), ...tools().map(tool => tool.site)].filter(Boolean))];
    return `<div class="field"><label for="mv-${esc(name)}">${esc(label)}</label><select id="mv-${esc(name)}" name="${esc(name)}" ${required ? 'required' : ''}><option value="">Choose an existing project</option>${sites.map(site => `<option value="${esc(site)}"${site === value ? ' selected' : ''}>${esc(site)}</option>`).join('')}</select></div>`;
  }

  function receiverField() {
    const users = state().users || state().profiles || [];
    if (store().mode === 'live') {
      const recipients = users.filter(user => ['engineer','architect'].includes(user.role));
      return `<div class="field"><label for="mv-receiver">Receiving Engineer / Architect</label><select id="mv-receiver" name="receiverId" required><option value="">Choose a recipient</option>${recipients.map(user => `<option value="${esc(user.id)}">${esc(user.name)} · ${esc(MCPAPermissions.labels[user.role])} · ${esc(user.projects?.join(', ') || 'No assigned project')} · ${esc(user.id)}</option>`).join('')}</select><p class="mv-help">Choose the person and project. The reference distinguishes people who share a name. Only this recipient can confirm receipt.</p></div>`;
    }
    return `<div class="field"><label for="mv-receiver">Receiving Engineer / Architect</label><input id="mv-receiver" name="receiver" list="mv-receivers" required maxlength="120" placeholder="Choose an existing Engineer / Architect"><datalist id="mv-receivers">${users.filter(user => !user.role || ['engineer', 'engr', 'architect'].includes(user.role.toLowerCase())).map(user => `<option value="${esc(user.name || user.full_name)}">${user.role ? esc(user.role) : 'Role awaiting verification'}</option>`).join('')}</datalist><p class="mv-help">Only the named receiving Engineer or Architect can inspect and confirm receipt.</p></div>`;
  }

  function toolPicker(kind) {
    const available = eligibleTools(kind);
    if (kind === 'repair' || kind === 'missing') {
      return `<div class="field"><label for="mv-tool">Tool</label><select id="mv-tool" name="toolId" required><option value="">Select a tool</option>${available.map(tool => `<option value="${esc(tool.id)}">${esc(tool.id)} · ${esc(tool.name)} · ${esc(tool.site)}</option>`).join('')}</select>${available.length ? '' : '<p class="mv-help">No eligible tools. Tools already reserved or in transit cannot be reported here.</p>'}</div>`;
    }
    return `<fieldset class="mv-tools"><legend>Choose asset records <span data-selected-count>0 selected</span></legend><label class="mv-sr" for="mv-tool-search">Search available tools</label><input id="mv-tool-search" class="mv-input" type="search" data-tool-search placeholder="Search tool name, ID or project"><div class="mv-tool-options">${available.length ? available.map(tool => `<label class="mv-tool-option" data-tool-text="${esc(`${tool.id} ${tool.name} ${tool.site}`.toLowerCase())}"><input type="checkbox" name="toolIds" value="${esc(tool.id)}"><span><strong>${esc(tool.name)}</strong><small>${esc(tool.id)} · ${esc(tool.site)} · Qty ${esc(tool.qty)} (whole record)</small></span><span class="mv-tool-state">${esc(STATUS[tool.status] || tool.status)}</span></label>`).join('') : '<p class="mv-help mv-empty-tools">No eligible tools are available. Tools reserved for a request or transfer are excluded.</p>'}<p class="mv-help mv-empty-tools" data-tool-no-results hidden>No tools match this search.</p></div></fieldset>`;
  }

  function conditionFields(toolIds, prefix) {
    return toolIds.map(id => {
      const tool = toolById(id);
      const key = `${prefix}-${id}`;
      const decision = prefix === 'receive' ? `<div class="field mv-custody-decision" data-decision-field hidden><label for="${esc(key)}-disposition">Custody decision for damaged equipment</label><select id="${esc(key)}-disposition" data-disposition disabled><option value="">Choose after reviewing the damage</option>${mode() === 'demo' ? '<option value="declined">Report issue and decline custody</option>' : ''}<option value="accepted">Accept custody with recorded damage</option></select><p class="mv-help">Acceptance changes custody and records the damage for review. ${mode() === 'demo' ? 'Declining keeps the current holder and project.' : 'If you cannot accept custody, contact Admin before confirming receipt.'} This record does not determine who caused the damage.</p></div>` : '';
      return `<div class="mv-inspection" data-inspection="${esc(id)}"><div class="mv-inspection-title"><strong>${esc(tool?.name || id)}</strong><span class="tool-id-chip">${esc(id)}</span></div>${prefix === 'receive' ? `<p class="mv-help">Current holder: <strong>${esc(tool?.holder || 'Unassigned')}</strong> · ${esc(tool?.site || 'Unassigned project')}</p>` : ''}<div class="field"><label for="${esc(key)}-condition">Inspected condition</label><select id="${esc(key)}-condition" data-condition required><option value="">Select after inspection</option><option value="good">Good — ready for use</option><option value="damaged">Damaged — needs repair</option><option value="lost">Missing — not received</option></select></div><div class="field"><label for="${esc(key)}-notes">Inspection notes <span class="mv-optional">(required for damaged or missing)</span></label><textarea id="${esc(key)}-notes" data-condition-notes rows="2" maxlength="2000" placeholder="Describe the condition and any pre-existing issue"></textarea></div>${decision}${prefix === 'receive' ? `<label class="checkbox-row"><input type="checkbox" data-tested> I tested this tool (not required for missing items).</label>` : ''}</div>`;
    }).join('');
  }

  function createForm() {
    const kind = current.kind;
    if (!operational() && kind !== 'request' && !(handler() && kind === 'transfer')) return '<aside class="card card-pad mv-guide"><h2>Review saved '+TITLES[kind].toLowerCase()+'</h2><p class="mv-help">Open a record to inspect its history and available follow-up actions. The named receiving Engineer or Architect confirms physical custody.</p></aside>';
    if (!operational() && !(handler() && kind === 'transfer')) return `<aside class="card card-pad mv-guide"><p class="eyebrow">Admin review</p><h2>Keep the handover moving</h2><ol><li>Review the engineer's selected tools and destination.</li><li>Approve to reserve the tools, or reject with a reason.</li><li>Release to generate a transfer code for the receiver.</li></ol><p class="mv-help">Stock and custody change as each movement is confirmed. Select a request to review it.</p></aside>`;
    const title = { request: 'Request tools', transfer: 'Create a transfer', return: 'Return tools', repair: 'Report a repair', missing: 'Report a missing tool' }[kind];
    const submit = { request: 'Submit request', transfer: 'Create transfer', return: 'Confirm return', repair: 'Submit repair report', missing: 'Submit missing report' }[kind];
    let fields = '';
    if (kind === 'request') fields = `${siteField('destination', 'Destination project', true)}<div class="field"><label for="mv-needed-until">Needed until (optional)</label><input id="mv-needed-until" name="neededUntil" type="date"></div><div class="field"><label for="mv-purpose">Purpose</label><textarea id="mv-purpose" name="purpose" rows="3" required maxlength="2000" placeholder="What work are these tools needed for?"></textarea></div>`;
    if (kind === 'transfer') fields = `${siteField('destination', 'Destination project', true)}${receiverField()}<div class="field"><label for="mv-notes">Handover notes <span class="mv-optional">(optional)</span></label><textarea id="mv-notes" name="notes" rows="2" maxlength="2000" placeholder="Instructions for the receiver"></textarea></div>`;
    if (kind === 'return') fields = `${siteField('destination', 'Return destination', true, 'Riverside Warehouse')}<div data-return-conditions></div><div class="field"><label for="mv-notes">Return notes <span class="mv-optional">(optional)</span></label><textarea id="mv-notes" name="notes" rows="2" maxlength="2000"></textarea></div><p class="mv-help">Good tools become available. Damaged and missing tools open a report for admin follow-up.</p>`;
    if (kind === 'repair' || kind === 'missing') fields = `<div class="field"><label for="mv-notes">${kind === 'repair' ? 'Damage / issue details' : 'Last seen and circumstances'}</label><textarea id="mv-notes" name="notes" required rows="4" maxlength="2000" placeholder="${kind === 'repair' ? 'Describe the fault and when it occurred' : 'Describe the last known location and what happened'}"></textarea></div><p class="mv-help">Submitting updates the tool's status and adds it to the admin ${kind === 'repair' ? 'repair queue' : 'missing tools register'}.</p>`;
    return `<section class="card card-pad mv-create"><h2>${title}</h2><p class="mv-help mv-identity">${esc(context().name ? `Submitting as ${context().name}` : 'Sign in to submit movements.')}</p><form data-form="create">${toolPicker(kind)}${fields}<button class="btn btn-primary btn-block" type="submit"${!eligibleTools(kind).length ? ' disabled' : ''}>${submit}</button></form></section>`;
  }

  function transferLookup() {
    return `<section class="card card-pad mv-receive"><div class="mv-section-heading"><div><p class="eyebrow">Incoming handover</p><h2>Receive a transfer</h2></div>${window.Html5Qrcode ? button('Scan QR', 'camera') : ''}</div><p class="mv-help">Enter the transfer code shared by the sender, then inspect every tool.</p><form data-form="lookup" class="mv-lookup"><label class="mv-sr" for="mv-code">Transfer code</label><input id="mv-code" name="code" class="mv-input" required maxlength="150" autocomplete="off" placeholder="e.g. TRF-000001"><button class="btn btn-accent" type="submit">Find transfer</button></form><div data-camera hidden><div id="mv-camera"></div>${button('Stop camera', 'stop-camera')}</div></section>`;
  }

  function descriptions() {
    return {
      request: admin() ? 'Review requests, reserve tools and release them for a documented handover.' : 'Request available tools and follow approval, release and receipt in one place.',
      transfer: 'Create a handover, share its code and record the condition of every tool received.',
      return: 'Close tool custody and send damaged or missing items to the right follow-up queue.',
      repair: admin() ? 'Track reported faults, start repairs and return completed tools to service.' : 'Report tool faults and track repair progress with the admin team.',
      missing: admin() ? 'Review missing-tool reports and record recovery with an inspected condition.' : 'Record missing tools with their last known details and track their recovery.'
    }[current.kind];
  }

  function renderShell() {
    if (!current) return;
    current.root.innerHTML = `<div class="movement-ui"><div class="page-head"><div><p class="eyebrow">Tool movement</p><h1 class="display">${TITLES[current.kind]}</h1><p class="sub">${descriptions()}</p></div></div><p class="sync-warning" data-sync-warning role="status"></p><div data-notice role="status" aria-live="polite"></div>${mode() === 'demo' ? '<div class="mv-demo-banner">Demo data · Saved in this browser and shared between the demo Engineer and Admin portals.</div>' : ''}<div data-summary class="mv-summary"></div>${current.kind === 'transfer' && operational() ? transferLookup() : ''}<div class="mv-workspace"><div data-create-panel>${createForm()}</div><div class="mv-record-area"><section class="card mv-records"><div class="mv-record-header"><h2>${admin() ? 'All' : 'Your'} ${TITLES[current.kind].toLowerCase()}</h2><div class="mv-list-filters"><label class="mv-sr" for="mv-search">Search movement records</label><input id="mv-search" class="mv-input" type="search" data-record-search placeholder="Search ID, tool, person or project" value="${esc(current.search)}"><label class="mv-sr" for="mv-status">Filter by status</label><select id="mv-status" class="mv-input" data-status><option value="">All statuses</option></select></div></div><div data-list></div></section><section class="card card-pad mv-detail" data-detail hidden aria-label="Movement details"></section></div></div></div>`;
    renderLists();
    renderNotice();
    if (current.detailId) renderDetail();
  }

  function renderNotice() {
    const host = current?.root.querySelector('[data-notice]');
    if (!host) return;
    host.innerHTML = current.message ? `<div class="mv-notice ${current.error ? 'mv-notice-error' : 'mv-notice-success'}">${esc(current.message)}${button('Dismiss', 'dismiss')}</div>` : '';
    host.setAttribute('role', current.error ? 'alert' : 'status');
  }

  function notify(message, error) {
    if (!current) return;
    current.message = message;
    current.error = Boolean(error);
    renderNotice();
  }

  function renderLists() {
    if (!current?.root.isConnected) return;
    const records = visibleRecords();
    const statusSelect = current.root.querySelector('[data-status]');
    if (!statusSelect) return;
    const statuses = [...new Set(records.map(recordStatus))];
    statusSelect.innerHTML = '<option value="">All statuses</option>' + statuses.map(status => `<option value="${esc(status)}">${esc(current.kind === 'transfer' && status === 'pending' ? 'Awaiting receipt' : STATUS[status] || status)}</option>`).join('');
    statusSelect.value = statuses.includes(current.status) ? current.status : '';
    if (!statusSelect.value) current.status = '';
    const open = records.filter(record => !['received', 'rejected', 'completed', 'recovered', 'returned'].includes(recordStatus(record))).length;
    const summary = current.root.querySelector('[data-summary]');
    if (summary) summary.innerHTML = `<div><span class="mv-summary-number">${records.length}</span><span>total ${TITLES[current.kind].toLowerCase()}</span></div><div><span class="mv-summary-number">${open}</span><span>${current.kind === 'transfer' ? 'awaiting receipt' : 'open records'}</span></div><div><span class="mv-summary-number">${eligibleTools(current.kind).length}</span><span>eligible tools</span></div>`;
    const query = current.search.toLowerCase();
    const filtered = records.filter(record => (!current.status || recordStatus(record) === current.status) && `${record.id} ${toolNames(record)} ${record.destination || ''} ${record.requester || record.sender || record.returnedBy || record.reportedBy || ''} ${record.receiver || ''} ${record.notes || ''}`.toLowerCase().includes(query)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const list = current.root.querySelector('[data-list]');
    list.innerHTML = filtered.length ? `<div class="table-wrap"><table><thead><tr><th>Movement / tools</th><th>Details</th><th>Status</th><th><span class="mv-sr">Actions</span></th></tr></thead><tbody>${filtered.map(record => `<tr${record.id === current.detailId ? ' class="mv-selected-row"' : ''}><td><span class="tool-id-chip">${esc(record.id)}</span><div class="cell-name mv-record-tools">${esc(toolNames(record))}</div><div class="cell-sub">${esc(date(record.createdAt))}</div></td><td><div class="cell-name">${esc(record.destination || toolById(record.toolId)?.site || '—')}</div><div class="cell-sub">${esc(record.requester || record.sender || record.returnedBy || record.reportedBy || '—')}</div>${record.receiver ? `<div class="cell-sub">To ${esc(record.receiver)}</div>` : ''}</td><td>${badge(recordStatus(record), current.kind)}</td><td>${button('View', 'view', record.id)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><div class="t">${records.length ? 'No matching movements' : `No ${TITLES[current.kind].toLowerCase()} yet`}</div><div class="d">${records.length ? 'Try another search or status filter.' : current.kind === 'request' && admin() ? 'Submitted engineer requests will appear here for review.' : 'Create a movement to start its history here.'}</div></div>`;
  }

  function detailRecord() {
    return (state()[COLLECTIONS[current.kind]] || []).find(record => record.id === current.detailId);
  }

  function renderDetail() {
    const host = current?.root.querySelector('[data-detail]');
    if (!host) return;
    const record = detailRecord();
    if (!record) { host.hidden = true; return; }
    host.hidden = false;
    current.detailDirty = false;
    const kind = current.kind;
    const row = (label, value) => value ? `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>` : '';
    let actions = '';
    if (kind === 'request' && admin() && record.status === 'pending') actions = `<div class="mv-action-row">${button('Approve request', 'approve', record.id, 'btn-accent')}</div><form data-form="reject" data-id="${esc(record.id)}" class="mv-followup"><div class="field"><label for="mv-reason">Reason for rejection</label><textarea id="mv-reason" name="reason" required maxlength="2000" rows="2" placeholder="Explain what needs to change"></textarea></div><button class="btn btn-danger btn-sm" type="submit">Reject request</button></form>`;
    if (kind === 'request' && admin() && record.status === 'approved') actions = `<p class="mv-help">The selected tools are reserved. Release them when they are ready for collection.</p><div class="mv-action-row">${button('Release tools & create transfer', 'release', record.id, 'btn-accent')}</div>`;
    if (kind === 'request' && record.transferId) actions += `<div class="mv-transfer-code"><span>Handover code</span><strong>${esc(record.transferId)}</strong>${button('Open transfer', 'open-transfer', record.transferId)}</div>`;
    if (kind === 'transfer') {
      actions = `<div class="mv-transfer-code"><span>Share this code with ${esc(record.receiver)}</span><strong>${esc(record.code || record.id)}</strong>${button('Copy code', 'copy', record.code || record.id)}<div data-transfer-qr></div></div>`;
      if (record.status === 'pending' && (operational() && (mode() === 'live' ? record.receiverId === context().id : record.receiver === context().name))) actions += `<form data-form="receive" data-id="${esc(record.id)}" class="mv-followup"><h3>Inspect the handover</h3><p class="mv-help">Choose a condition for every tool. Damaged and missing items will open follow-up reports.</p>${conditionFields(ids(record), 'receive')}<button type="submit" class="btn btn-primary btn-block">Confirm receipt of all inspected tools</button></form>`;
      else if (record.status === 'pending') actions += `<p class="mv-help">Waiting for ${esc(record.receiver)} to inspect and confirm this transfer.</p>`;
    }
    if (kind === 'repair' && admin() && record.status === 'reported') actions = `<div class="mv-action-row">${button('Start repair', 'start-repair', record.id, 'btn-accent')}</div>`;
    if (kind === 'repair' && admin() && record.status === 'underrepair') actions += `<form data-form="complete-repair" data-id="${esc(record.id)}" class="mv-followup"><h3>Return to service</h3>${siteField('repairDestination', 'Available at project', true, toolById(record.toolId)?.site)}<div class="field"><label for="mv-resolution">Repair completion notes</label><textarea name="notes" id="mv-resolution" required rows="2" maxlength="2000" placeholder="Describe the repair and checks performed"></textarea></div><button class="btn btn-primary" type="submit">Complete repair</button></form>`;
    if (kind === 'missing' && admin() && record.status === 'missing') actions = `<form data-form="recover" data-id="${esc(record.id)}" class="mv-followup"><h3>Record recovery</h3>${siteField('recoveryDestination', 'Recovered at project', true, toolById(record.toolId)?.site)}<div class="field"><label for="mv-recovered-condition">Recovered condition</label><select name="condition" id="mv-recovered-condition" required><option value="">Select inspected condition</option><option value="good">Good — available for use</option><option value="damaged">Damaged — send for repair</option></select></div><div class="field"><label for="mv-recovery-notes">Recovery details</label><textarea id="mv-recovery-notes" name="notes" required rows="2" maxlength="2000" placeholder="Where and how was the tool recovered?"></textarea></div><button class="btn btn-primary" type="submit">Confirm recovery</button></form>`;
    const inspections = record.inspections || record.conditions || [];
    host.innerHTML = `<div class="mv-section-heading"><div><p class="eyebrow">Movement details</p><h2>${esc(record.id)}</h2></div>${button('Close', 'close-detail')}</div>${badge(recordStatus(record), kind)}<div class="mv-detail-tools">${ids(record).map(id => `<div><span class="tool-id-chip">${esc(id)}</span> ${esc(toolById(id)?.name || '')}</div>`).join('')}</div>${row('Created', date(record.createdAt))}${row('Requested by', record.requester)}${row('Sent by', record.sender)}${row('Returned by', record.returnedBy)}${row('Reported by', record.reportedBy)}${row('Receiver', record.receiver)}${row('Destination', record.destination)}${row('Needed until', record.neededUntil)}${row('Purpose', record.purpose)}${row('Notes', record.notes)}${row('Rejection reason', record.reason)}${row('Received', record.receivedAt ? date(record.receivedAt) : '')}${row('Resolution', record.resolutionNotes || record.completionNotes || record.recoveryNotes || record.resolution)}${inspections.length ? `<div class="mv-inspection-results"><h3>Recorded condition</h3>${inspections.map(item => `<div class="kv"><span class="k">${esc(item.toolId)}</span><span class="v">${esc(item.condition === 'lost' ? 'Missing' : item.condition)}${item.notes ? `<small>${esc(item.notes)}</small>` : ''}</span></div>`).join('')}</div>` : ''}${actions}`;
    if (kind === 'transfer' && window.QRCode) {
      try { new window.QRCode(host.querySelector('[data-transfer-qr]'), { text: record.code || record.id, width: 128, height: 128 }); } catch (_) { /* The manual transfer code remains available. */ }
    }
  }

  function syncReturnConditions() {
    const host = current.root.querySelector('[data-return-conditions]');
    if (!host) return;
    const existing = new Map([...host.querySelectorAll('[data-inspection]')].map(item => [item.dataset.inspection, item]));
    const selected = [...current.root.querySelectorAll('[name="toolIds"]:checked')].map(input => input.value);
    host.replaceChildren();
    selected.forEach(id => {
      if (existing.has(id)) host.append(existing.get(id));
      else host.insertAdjacentHTML('beforeend', conditionFields([id], 'return'));
    });
  }

  function readConditions(form) {
    return [...form.querySelectorAll('[data-inspection]')].map(item => {
      const condition = item.querySelector('[data-condition]').value;
      const notes = item.querySelector('[data-condition-notes]').value.trim();
      if (!condition) throw new Error('Inspect every selected tool before confirming.');
      if (condition !== 'good' && !notes) throw new Error('Add inspection notes for every damaged or missing tool.');
      const tested = item.querySelector('[data-tested]')?.checked;
      if (form.dataset.form === 'receive' && condition !== 'lost' && !tested) throw new Error('Test each received tool before confirming receipt.');
      const disposition = condition === 'damaged' ? item.querySelector('[data-disposition]')?.value : condition === 'lost' ? 'declined' : 'accepted';
      if (form.dataset.form === 'receive' && !disposition) throw new Error('Choose a custody decision for each damaged tool.');
      return { toolId: item.dataset.inspection, condition, notes, ...(tested !== undefined ? {tested, disposition} : {}) };
    });
  }

  async function perform(operation, message, options) {
    const active = current;
    if (!active || active.busy) return;
    active.busy = true;
    const controls = [...active.root.querySelectorAll('button, input, select, textarea')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    active.root.setAttribute('aria-busy', 'true');
    try {
      const result = await operation();
      if (current !== active) return result;
      if (options?.resetCreate || !active.createDirty) {
        active.root.querySelector('[data-create-panel]').innerHTML = createForm();
        active.createDirty = false;
      }
      if (options?.showResult && result?.id) active.detailId = result.id;
      renderLists();
      if (!options?.preserveDetail || !active.detailDirty) renderDetail();
      notify(typeof message === 'function' ? message(result) : message);
      return result;
    } catch (error) {
      if (current === active) notify(error.message || 'The movement could not be saved. Please refresh and try again.', true);
    } finally {
      active.busy = false;
      controls.forEach((control, index) => { if (control.isConnected) control.disabled = disabled[index]; });
      active.root.removeAttribute('aria-busy');
    }
  }

  async function submit(event) {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    if (current.busy || !form.reportValidity()) return;
    const data = new FormData(form);
    const value = name => String(data.get(name) || '').trim();
    const action = form.dataset.form;
    try {
      if (action === 'lookup') {
        const code = value('code');
        await perform(async () => {
          await store().refresh();
          const transfer = store().findTransfer(code);
          if (!transfer) throw new Error('No transfer found for that code. Check the code and data source.');
          current.detailId = transfer.id;
          return transfer;
        }, 'Transfer found. Review its details below.');
        current?.root.querySelector('[data-detail]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (action === 'create') {
        const kind = current.kind;
        const toolIds = data.getAll('toolIds');
        if (['request', 'transfer', 'return'].includes(kind) && !toolIds.length) throw new Error('Select at least one tool.');
        const payload = { toolIds, destination: value('destination'), receiver: value('receiver'), purpose: value('purpose'), notes: value('notes'), toolId: value('toolId'), neededUntil: value('neededUntil') };
        if (store().mode === 'live') { delete payload.receiver; if (kind === 'transfer') payload.receiverId = value('receiverId'); }
        if (kind === 'return') payload.conditions = readConditions(form);
        const methods = { request: 'createRequest', transfer: 'createTransfer', return: 'createReturn', repair: 'reportRepair', missing: 'reportMissing' };
        await perform(() => store()[methods[kind]](payload), result => kind === 'transfer' ? `Transfer ${result?.code || result?.id || ''} created. Share the code with the receiver.` : `${TITLES[kind] === 'Missing tools' ? 'Missing report' : { request: 'Request', return: 'Return', repair: 'Repair report' }[kind]} saved successfully.`, { resetCreate: true, showResult: true });
      } else if (action === 'reject') await perform(() => store().rejectRequest(form.dataset.id, value('reason')), 'Request rejected. The reason is visible to the requester.');
      else if (action === 'receive') {
        const inspections = readConditions(form);
        await perform(() => store().receiveTransfer(form.dataset.id, { inspections }), 'Receipt confirmed. Custody and any repair or missing reports have been updated.', { resetCreate: true });
      } else if (action === 'complete-repair') await perform(() => store().completeRepair(form.dataset.id, { notes: value('notes'), destination: value('repairDestination') }), 'Repair completed. The tool is available for use.', { resetCreate: true });
      else if (action === 'recover') await perform(() => store().recoverMissing(form.dataset.id, { condition: value('condition'), notes: value('notes'), destination: value('recoveryDestination') }), value('condition') === 'damaged' ? 'Recovery recorded. A repair report has been opened.' : 'Recovery recorded. The tool is available for use.', { resetCreate: true });
    } catch (error) { notify(error.message, true); }
  }

  async function stopCamera(active) {
    active = active || current;
    if (!active) return;
    const scanner = active.scanner;
    active.scanner = null;
    if (scanner) {
      try { if (scanner.isScanning) await scanner.stop(); } catch (_) { /* Camera may already be stopped. */ }
      try { scanner.clear(); } catch (_) { /* Container may have been removed by navigation. */ }
    }
    const camera = active.root.querySelector('[data-camera]');
    if (camera) camera.hidden = true;
  }

  async function startCamera() {
    const active = current;
    if (!window.Html5Qrcode || active.scanner) return;
    const camera = active.root.querySelector('[data-camera]');
    camera.hidden = false;
    const scanner = new window.Html5Qrcode('mv-camera');
    active.scanner = scanner;
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 8, qrbox: { width: 220, height: 220 } }, async decoded => {
        if (current !== active || active.scanner !== scanner) return;
        await stopCamera(active);
        if (current !== active) return;
        active.root.querySelector('[name="code"]').value = decoded.trim();
        active.root.querySelector('[data-form="lookup"]').requestSubmit();
      }, () => {});
      if (current !== active || active.scanner !== scanner) {
        try { await scanner.stop(); scanner.clear(); } catch (_) { /* Navigation interrupted startup. */ }
      }
    } catch (_) {
      await stopCamera(active);
      if (current === active) notify('Camera could not start. Allow camera access on HTTPS or enter the transfer code manually.', true);
    }
  }

  async function click(event) {
    const target = event.target.closest('[data-action]');
    if (!target || current.busy) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (action === 'dismiss') { current.message = ''; renderNotice(); }
    else if (action === 'view') { current.detailId = id; renderLists(); renderDetail(); current.root.querySelector('[data-detail]').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    else if (action === 'close-detail') { current.detailId = ''; current.root.querySelector('[data-detail]').hidden = true; renderLists(); }
    else if (action === 'approve') await perform(() => store().approveRequest(id), 'Request approved. Its tools are reserved and ready for release.');
    else if (action === 'release') await perform(() => store().releaseRequest(id), 'Tools released. Share the handover code with the receiver.');
    else if (action === 'start-repair') await perform(() => store().startRepair(id), 'Repair started. The tool remains unavailable.');
    else if (action === 'open-transfer') {
      if (typeof window.showScreen === 'function') window.showScreen('transfer', () => window.MovementUI.openTransfer(id));
    } else if (action === 'copy') {
      try { await navigator.clipboard.writeText(id); notify('Transfer code copied.'); } catch (_) { notify(`Copy this transfer code: ${id}`); }
    } else if (action === 'camera') await startCamera();
    else if (action === 'stop-camera') await stopCamera();
    else if (action === 'retry') await mount(current.kind);
  }

  function input(event) {
    const target = event.target;
    if (target.matches('[data-record-search]')) { current.search = target.value; renderLists(); }
    if (target.matches('[data-tool-search]')) {
      const query = target.value.toLowerCase();
      let visible = 0;
      current.root.querySelectorAll('[data-tool-text]').forEach(row => { row.hidden = !row.dataset.toolText.includes(query); if (!row.hidden) visible++; });
      const empty = current.root.querySelector('[data-tool-no-results]');
      if (empty) empty.hidden = visible > 0 || !current.root.querySelector('[data-tool-text]');
    }
    if (target.closest('[data-form="create"]')) current.createDirty = true;
    if (target.closest('[data-detail] form')) current.detailDirty = true;
  }

  async function change(event) {
    const target = event.target;
    if (target.matches('[data-status]')) { current.status = target.value; renderLists(); }
    if (target.matches('[name="toolIds"]')) {
      const count = current.root.querySelectorAll('[name="toolIds"]:checked').length;
      current.root.querySelector('[data-selected-count]').textContent = `${count} selected`;
      syncReturnConditions();
    }
    if (target.matches('[data-condition]')) {
      const inspection = target.closest('[data-inspection]');
      inspection.querySelector('[data-condition-notes]').required = Boolean(target.value && target.value !== 'good');
      const decision = inspection.querySelector('[data-decision-field]');
      if (decision) {
        const damaged = target.value === 'damaged';
        decision.hidden = !damaged;
        const select = decision.querySelector('select');
        select.disabled = !damaged; select.required = damaged;
        if (!damaged) select.value = '';
      }
    }
  }

  function renderError(error) {
    current.root.innerHTML = `<div class="movement-ui"><div class="page-head"><div><p class="eyebrow">Tool movement</p><h1 class="display">${TITLES[current.kind]}</h1></div></div><div class="card card-pad mv-setup" role="alert"><h2>Movement data is unavailable</h2><p>${esc(error?.message || 'The database could not be reached.')}</p><p class="mv-help">We will retry automatically. Contact your administrator if access is unavailable.</p><div class="mv-action-row">${button('Retry connection', 'retry', null, 'btn-primary')}</div></div></div>`;
  }

  async function mount(kind) {
    dispose();
    const root = document.getElementById(`screen-${kind}`);
    if (!root || !TITLES[kind]) return;
    const active = { kind, root, generation: ++generation, search: '', status: '', detailId: '', message: '', busy: false, scanner: null, createDirty: false, detailDirty: false };
    let finishMount;
    active.mounted = new Promise(resolve => { finishMount = resolve; });
    current = active;
    root.innerHTML = '<div class="movement-ui"><div class="card card-pad mv-loading" role="status">Loading movement records…</div></div>';
    root.addEventListener('click', click);
    root.addEventListener('submit', submit);
    root.addEventListener('input', input);
    root.addEventListener('change', change);
    if (mode() === 'live') active.stopWatching = window.EquipmentTracking.watch(async () => {
      await active.mounted;
      if (current !== active || active.busy) return;
      await store().refresh();
      if (current === active && !root.querySelector('[data-list]')) renderShell();
    }, message => {
      if (current !== active) return;
      const status = root.querySelector('[data-sync-warning]');
      if (status) status.textContent = message;
    });
    try {
      if (!store()) throw new Error('The movement service has not loaded. Reload the page and try again.');
      await store().refresh();
      if (current !== active) return;
      renderShell();
      if (window.movementDraft?.kind === kind) {
        const selected = window.movementDraft.toolIds;
        window.movementDraft = null;
        root.querySelectorAll('[name="toolIds"]').forEach(input => {
          if (selected.includes(input.value)) { input.checked = true; input.dispatchEvent(new Event('change', {bubbles:true})); }
        });
        const toolSelect = root.querySelector('[name="toolId"]');
        if (toolSelect && [...toolSelect.options].some(option => option.value === selected[0])) toolSelect.value = selected[0];
        active.createDirty = true;
      }
    } catch (error) { if (current === active) renderError(error); }
    finally { finishMount(); }
  }

  function dispose() {
    const active = current;
    if (!active) return;
    current = null;
    active.stopWatching?.();
    void stopCamera(active);
    active.root.removeEventListener('click', click);
    active.root.removeEventListener('submit', submit);
    active.root.removeEventListener('input', input);
    active.root.removeEventListener('change', change);
  }

  window.addEventListener('mcpa:movement-change', () => {
    if (!current || current.busy || !current.root.isConnected || !current.root.querySelector('[data-list]')) return;
    renderLists();
    if (!current.createDirty && !document.activeElement?.closest('[data-form="create"]')) {
      const host = current.root.querySelector('[data-create-panel]');
      if (host) host.innerHTML = createForm();
    }
    if (!current.detailDirty && !document.activeElement?.closest('[data-detail] form')) renderDetail();
  });
  window.MovementUI = {
    mount,
    dispose,
    openRecord: async (kind, id) => {
      if (current?.kind !== kind) return;
      const active = current;
      const navigation = active.navigation = (active.navigation || 0) + 1;
      // The initial snapshot and module script can finish in either order.
      // Wait for the initial render so it cannot replace the focused target.
      await active.mounted;
      if (current !== active || active.navigation !== navigation) return;
      active.detailId = ''; active.detailDirty = false;
      renderDetail();
      try {
        await store().refresh();
        if (current !== active || active.navigation !== navigation) return;
        if (!active.root.querySelector('[data-list]')) renderShell();
        if (!visibleRecords().some(record => record.id === id)) {
          notify('This record is unavailable or your account no longer has access. Refresh the activity list.', true);
          active.root.querySelector('[data-notice]')?.setAttribute('tabindex', '-1');
          active.root.querySelector('[data-notice]')?.focus();
          return;
        }
        active.detailId = id; active.search = ''; active.status = '';
        active.root.querySelector('[data-record-search]').value = '';
        renderLists(); renderDetail();
        const detail = active.root.querySelector('[data-detail]');
        detail.setAttribute('tabindex', '-1');
        detail.focus({preventScroll:true});
        detail.scrollIntoView({block:'start'});
      } catch (error) {
        if (current === active && active.navigation === navigation) notify(error.message, true);
      }
    },
    render: () => { if (current) { renderLists(); if (!current.detailDirty) renderDetail(); } },
    openTransfer: async id => {
      if (current?.kind !== 'transfer') return;
      const active = current;
      try {
        await store().initialize();
        if (current !== active) return;
        const transfer = store().findTransfer(id);
        if (!transfer) { notify('This transfer could not be found in the current data source.', true); return; }
        active.detailId = transfer.id;
        renderLists(); renderDetail();
        active.root.querySelector('[data-detail]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (error) { if (current === active) notify(error.message, true); }
    }
  };
}());

