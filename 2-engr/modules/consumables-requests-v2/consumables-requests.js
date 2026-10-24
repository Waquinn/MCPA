/* Mount after core.js; use the existing authenticated Supabase client. */
(function (scope) {
  'use strict';
  async function mount({root, client}) {
    if (!root || typeof root.querySelector !== 'function') throw Error('A mount root is required.');
    const C = scope.MCPAConsumablesRequests, E = C.escape, api = C.createClient(client);
    let snapshot, busy = false, destroyed = false, selected = null;
    let message = '', error = false, search = '', category = '', status = '';
    let draft = {site_id:'',purpose:'',quantities:{}};
    const date = value => value ? new Date(value).toLocaleString('en-PH', {timeZone:'Asia/Manila'}) : '—';
    const label = value => ({pending:'Pending',approved:'Approved',rejected:'Rejected',partially_fulfilled:'Partially fulfilled',partial:'Partially fulfilled',issued:'Issued'}[value] || value);
    const options = (rows, current, placeholder) => `<option value="">${placeholder}</option>` + rows.map(row => `<option value="${E(row.id)}" ${row.id === current ? 'selected' : ''}>${E(row.name)}</option>`).join('');
    function history() {
      const rows = snapshot.requests.filter(request => !status || request.status === status);
      return `<div class="wa-fields"><label>Request status<select data-field="status"><option value="">All statuses</option>${[...new Set(snapshot.requests.map(r=>r.status))].map(value=>`<option value="${E(value)}" ${value===status?'selected':''}>${E(label(value))}</option>`).join('')}</select></label></div><div class="wa-table">${rows.length ? `<table><thead><tr><th>Request</th><th>Project/site</th><th>Items</th><th>Status</th><th>Submitted</th><th>Details</th></tr></thead><tbody>${rows.map(request=>`<tr><td>#${E(request.request_number)}</td><td>${E(request.site_name)}</td><td>${request.items.length}</td><td><span class="wa-status">${E(label(request.status))}</span></td><td>${E(date(request.created_at))}</td><td><button type="button" data-open="${E(request.id)}" aria-label="View request ${E(request.request_number)}">View</button></td></tr>`).join('')}</tbody></table>` : '<div class="wa-empty">Your requests will appear here after submission. Change the status filter to see more history.</div>'}</div>`;
    }
    function detail() {
      const request = snapshot.requests.find(r=>r.id===selected);
      if (!request) return '';
      return `<section class="wa-details" aria-label="Request details"><h2>Request #${E(request.request_number)}</h2><p>${E(request.site_name)} · ${E(label(request.status))}</p>${request.purpose?`<p>Purpose: ${E(request.purpose)}</p>`:''}${request.note?`<p>Admin note: ${E(request.note)}</p>`:''}<div class="wa-table"><table><thead><tr><th>Consumable</th><th>Unit</th><th>Requested</th><th>Approved</th><th>Issued</th><th>Confirmed consumed</th></tr></thead><tbody>${request.items.map(item=>`<tr><td>${E(item.item_name)}<small>${E(item.item_code)} ${E(item.specification)}</small></td><td>${E(item.unit)}</td><td>${C.format(item.requested_quantity)}</td><td>${request.status==='pending'?'Awaiting review':C.format(item.approved_quantity)}</td><td>${C.format(item.issued_quantity)}</td><td>${item.confirmed_consumed_quantity == null ? 'Not recorded' : C.format(item.confirmed_consumed_quantity)}</td></tr>`).join('')}</tbody></table></div><h3>Issuance history</h3>${request.issues.length?`<div class="wa-table"><table><thead><tr><th>Item</th><th>Issued</th><th>Issued by</th><th>Issuance date (Manila)</th></tr></thead><tbody>${request.issues.map(issue=>{const item=request.items.find(i=>i.id===issue.item_id);return `<tr><td>${E(item?.item_name)}</td><td>${C.format(issue.quantity)} ${E(item?.unit)}</td><td>${E(issue.issued_by_name)}</td><td>${E(date(issue.issued_at))}</td></tr>`;}).join('')}</tbody></table></div>`:'<p>No quantities have been issued for this request.</p>'}</section>`;
    }
    function catalogRows() {
      const rows = snapshot.catalog.filter(item => (!category || (item.category || 'Unclassified') === category) && (!search || [item.name,item.item_code,item.specification].join(' ').toLowerCase().includes(search.toLowerCase())));
      return rows.length ? `<table><thead><tr><th>Consumable</th><th>Required quantity</th><th>Available stock</th><th>Category</th></tr></thead><tbody>${rows.map(item=>`<tr><td>${E(item.name)}<small>${E(item.item_code)} ${E(item.specification)}</small><small class="wa-mobile-stock">Available: ${C.format(item.current_stock)} ${E(item.unit)}</small></td><td><input data-quantity="${E(item.id)}" aria-label="Required quantity for ${E(item.name)} ${E(item.specification)}" type="number" inputmode="decimal" min="0.001" max="999999999.999" step="0.001" value="${E(draft.quantities[item.id] || '')}"><small>${E(item.unit)}</small></td><td>${C.format(item.current_stock)} ${E(item.unit)}</td><td>${E(item.category || 'Unclassified')}</td></tr>`).join('')}</tbody></table>` : '<div class="wa-empty">No consumables match. Try another item or category.</div>';
    }
    function render() {
      if (destroyed) return;
      root.classList.add('wa-cons');
      root.setAttribute('aria-busy', String(busy));
      if (!snapshot) {root.innerHTML=`<header><div><h1>Consumables requests</h1><p>Request materials for your project/site.</p></div><button data-action="refresh" ${busy?'disabled':''}>Refresh</button></header><div role="status" class="wa-message ${error?'error':''}">${E(message)}</div>${busy?'<div class="wa-skeleton" aria-label="Loading consumables"></div>':''}`;return;}
      const categories = [...new Set(snapshot.catalog.map(item=>item.category || 'Unclassified'))].sort();
      root.innerHTML = `<header><div><h1>Consumables requests</h1><p>Choose materials and quantities. Your Admin will review and issue the approved stock.</p></div><button type="button" data-action="refresh" ${busy?'disabled':''}>Refresh</button></header><div class="wa-message ${error?'error':''}" role="status" aria-live="polite">${E(message)}</div>${api.getPending()?'<div class="wa-actions"><button type="button" data-action="recover">Retry interrupted submission</button></div>':''}<form data-request-form><fieldset ${busy?'disabled':''} style="border:0;padding:0;margin:0;min-width:0"><h2>New request</h2><div class="wa-fields"><label>Project/site<select required data-field="site_id">${options(snapshot.sites,draft.site_id,'Choose project/site')}</select></label><label>Category<select data-field="category"><option value="">All categories</option>${categories.map(value=>`<option value="${E(value)}" ${value===category?'selected':''}>${E(value)}</option>`).join('')}</select></label><label>Search consumables<input data-field="search" type="search" placeholder="Item, code or specification" value="${E(search)}"></label><button type="button" data-action="filter">Apply search</button></div><div class="wa-table" data-catalog>${catalogRows()}</div><p data-selection>${Object.values(draft.quantities).filter(Boolean).length} item(s) selected across all categories.</p><label>Purpose <small>Optional, up to 1,000 characters</small><textarea data-field="purpose" maxlength="1000">${E(draft.purpose)}</textarea></label><div class="wa-actions"><button class="primary" type="submit">${busy?'Saving…':'Submit request'}</button></div></fieldset></form><h2>Request history</h2>${history()}${detail()}`;
    }
    async function refresh() {
      if (busy || destroyed) return;
      busy=true;render();
      try {
        const value=await api.call('mcpa_wa_consumables_snapshot',{});
        if (!['engineer','architect'].includes(value.profile?.role)) throw Error('An active Engineer or Architect account is required for this screen.');
        api.bindActor(value.profile.id);
        snapshot=value;
      } catch (e) {message=C.errorText(e);error=true;}
      finally {busy=false;render();}
    }
    function input(event) {
      const field=event.target.dataset.field, item=event.target.dataset.quantity;
      if (item) {draft.quantities[item]=event.target.value;const count=root.querySelector('[data-selection]');if(count)count.textContent=Object.values(draft.quantities).filter(Boolean).length+' item(s) selected across all categories.';}
      if (field==='purpose' || field==='site_id') draft[field]=event.target.value;
      if (field==='search') search=event.target.value;
    }
    function change(event) {
      const field=event.target.dataset.field;
      if (field==='category') {category=event.target.value;render();}
      if (field==='status') {status=event.target.value;render();}
    }
    function keydown(event) {if(event.key==='Enter'&&event.target.dataset.field==='search'){event.preventDefault();render();}}
    async function click(event) {
      const button=event.target.closest('button');if (!button || !root.contains(button) || busy) return;
      if (button.dataset.action==='refresh') return refresh();
      if (button.dataset.action==='recover') {
        busy=true;render();
        try {const saved=await api.retryPending();selected=saved.id;draft={site_id:draft.site_id,purpose:'',quantities:{}};message='Interrupted submission recovered.';error=false;}
        catch(e){message=C.errorText(e);error=true;}
        finally{busy=false;render();}
        if(!error)await refresh();return;
      }
      if (button.dataset.action==='filter') return render();
      if (button.dataset.open) {selected=button.dataset.open;render();root.querySelector('.wa-details')?.scrollIntoView({block:'start',behavior:'auto'});}
    }
    async function submit(event) {
      event.preventDefault();if(busy || !snapshot)return;
      try {
        const payload=C.validateRequest({...draft,items:Object.entries(draft.quantities).filter(([,q])=>q!=='').map(([id,q])=>({consumable_id:id,quantity:q,unit:snapshot.catalog.find(item=>item.id===id)?.unit}))},snapshot.catalog,snapshot.sites);
        busy=true;message='Saving request…';error=false;render();
        const saved=await api.mutate('mcpa_wa_submit_consumables',{p_site_id:payload.site_id,p_purpose:payload.purpose,p_items:payload.items});
        draft={site_id:draft.site_id,purpose:'',quantities:{}};selected=saved.id || saved.request_id || null;
        message='Request saved. Your Admin can now review it.';
      } catch(e) {message=C.errorText(e);error=true;}
      finally {busy=false;render();}
      if(!error) await refresh();
    }
    root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('keydown',keydown);root.addEventListener('click',click);root.addEventListener('submit',submit);
    await refresh();
    return {refresh,destroy(){destroyed=true;root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('keydown',keydown);root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.replaceChildren();root.classList.remove('wa-cons');}};
  }
  scope.MCPAConsumablesRequesterV2={mount};
})(globalThis);
