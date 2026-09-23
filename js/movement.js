/* Shared, per-mount Movement controller. No DOM is captured before init(). */
(function () {
  'use strict';
  const titles = { request: 'Requests', transfer: 'Transfers', return: 'Returns', repair: 'Repair Center', missing: 'Missing Tools' };
  const labels = {
    request: { form: 'Request equipment', save: 'Submit request', history: 'Request history' },
    transfer: { form: 'Transfer equipment', save: 'Record transfer', history: 'Transfer history' },
    return: { form: 'Receive equipment', save: 'Confirm return', history: 'Return history' },
    repair: { form: 'Log a repair', save: 'Save repair', history: 'Repair history' },
    missing: { form: 'Report missing equipment', save: 'Report missing', history: 'Missing reports' }
  };
  const descriptions = {
    request: 'Request available equipment, approve its release, and record receipt.',
    transfer: 'Record a transfer between sites. Assignment changes when receipt is confirmed.',
    return: 'Receive assigned equipment and record its condition. Damaged returns open a repair case.',
    repair: 'Record repair details and resolve the outcome against the equipment record.',
    missing: 'Record missing equipment and confirm recovery when it has been located.'
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const active = row => ['pending', 'approved', 'released', 'open'].includes(row.workflow_status);
  const stateLabel = value => String(value || 'Unknown').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
  const message = error => {
    console.error('Movement operation failed', error);
    if (error?.code === '22023' && error.message === 'Lost equipment cannot be returned. Report it in Missing Tools.') return error.message;
    if (['PGRST202','PGRST204','PGRST205','42703','42883'].includes(error?.code)) return 'Movement setup is not available yet. Ask your administrator to complete the database setup, then refresh.';
    if (error?.code === '42501') return 'Your account cannot perform this action. Check your access and try again.';
    if (['40001','23505'].includes(error?.code)) return 'This equipment or movement changed, or already has an open movement. Refresh and review the latest records.';
    if (error?.code === '23503') return 'A referenced equipment, site or holder is no longer available. Refresh and select a current record.';
    if (['22023','23514','23502'].includes(error?.code)) return 'The movement details are not valid for the current equipment. Refresh and check the selections.';
    if (error?.code === 'P0002') return 'This record is no longer available. Refresh to see current records.';
    return 'The operation could not be completed. Check your connection and try again. Your entries have been kept.';
  };
  async function readAll(client, table, context) {
    const result = []; let offset = 0;
    for (;;) {
      let query = client.from(table).select('*').order('id').range(offset, offset + 499);
      if (context.signal && query.abortSignal) query = query.abortSignal(context.signal);
      const { data, error } = await query;
      if (error) throw error;
      if (!context.isCurrent()) return [];
      if (!data?.length) return result;
      result.push(...data); offset += data.length;
      // Continue until empty: PostgREST can cap below our requested range.
    }
  }
  function register(module, kind, screen) {
    let dispose = () => {};
    window.MCPAModules = window.MCPAModules || {};
    window.MCPAModules[module] = {
      init(context) {
        dispose();
        const root = context.root.querySelector('#screen-' + screen);
        if (!root) return;
        const controller = new AbortController(); let stopped = false; let loadVersion = 0;
        const current = () => !stopped && context.isCurrent() && root.isConnected;
        const state = { equipment: [], sites: [], profiles: [], movements: [], loading: false, busy: false, failed: false, page: 1, id: crypto.randomUUID() };
        const client = window.MCPA.getClient();
        dispose = () => { stopped = true; controller.abort(); };
        root.innerHTML = `<div class="page-head"><div><h1 class="display">${titles[kind]}</h1><p class="sub">${descriptions[kind]}</p></div><button type="button" class="btn btn-secondary" data-mv="refresh">Refresh</button></div>
          <div data-mv-feedback role="status" aria-live="polite"></div>
          <div class="two-col movement-layout"><div><div class="section-title"><h2>${labels[kind].form}</h2></div>
          <form class="card card-pad" data-mv-form><fieldset data-mv-fields disabled>
          <div class="field"><label for="mv-equipment">Equipment</label><select id="mv-equipment" name="equipment" required><option value="">Loading equipment…</option></select></div>
          <p class="movement-note" data-mv-summary>Select equipment to see its current assignment.</p>
          ${['request','transfer','return'].includes(kind) ? '<div class="field"><label for="mv-site">' + (kind === 'return' ? 'Receiving site' : 'Destination site') + '</label><select id="mv-site" name="site" required></select></div>' : ''}
          ${['request','transfer'].includes(kind) ? '<div class="field"><label for="mv-holder">' + (kind === 'request' ? 'Requested for' : 'Receiving holder (optional)') + '</label><select id="mv-holder" name="holder" ' + (kind === 'request' ? 'required' : '') + '></select></div>' : ''}
          ${kind === 'request' ? '<div class="field"><label for="mv-date">Needed until (optional)</label><input type="date" id="mv-date" name="needed"></div>' : ''}
          ${kind === 'return' ? '<div class="field"><label for="mv-condition">Condition on return</label><select id="mv-condition" name="condition">' + ['Good','Fair','Damaged','For Repair','Missing Parts'].map(x => `<option>${x}</option>`).join('') + '</select></div><p class="movement-note">Report lost equipment in Missing Tools to retain its last site and holder.</p>' : ''}
          ${kind === 'repair' ? '<div class="field"><label for="mv-shop">Repair shop (optional)</label><input id="mv-shop" name="shop" maxlength="160"></div><div class="field"><label for="mv-cost">Repair cost, PHP (optional)</label><input id="mv-cost" name="cost" type="number" min="0" max="9999999999.99" step="0.01"></div>' : ''}
          <div class="field"><label for="mv-notes">${kind === 'repair' ? 'Problem / repair details' : kind === 'missing' ? 'Last known circumstances' : 'Purpose / notes'}</label><textarea id="mv-notes" name="notes" rows="3" maxlength="2000" required></textarea></div>
          <p class="movement-note">Each record covers the full equipment quantity. Partial quantities are not supported.</p>
          <div class="movement-actions"><button class="btn btn-primary" type="submit">${labels[kind].save}</button><button class="btn btn-secondary" type="reset">Clear</button></div>
          </fieldset></form></div>
          <div><div class="section-title"><h2>${labels[kind].history}</h2><span class="eyebrow" data-mv-count></span></div>
          <div class="movement-toolbar"><div class="field"><label for="mv-search">Search records</label><input id="mv-search" type="search" placeholder="Equipment, site, holder or notes"></div><div class="field"><label for="mv-filter">Status</label><select id="mv-filter"><option value="">All statuses</option><option value="active">Open</option><option value="closed">Closed</option></select></div></div>
          <div class="card" data-mv-table aria-live="polite">Loading records…</div><div class="movement-pagination" data-mv-pagination></div></div></div>`;
        const form = root.querySelector('[data-mv-form]');
        const fields = form.querySelector('fieldset');
        function feedback(text, error = false) { const el = root.querySelector('[data-mv-feedback]'); el.textContent = text; el.className = text ? 'movement-feedback' + (error ? ' movement-error' : '') : ''; }
        function site(id) { return state.sites.find(x => x.id === id)?.name || (id ? 'Unavailable site' : 'Unassigned'); }
        function holder(id) { return state.profiles.find(x => x.id === id)?.name || (id ? 'Profile ' + id.slice(0, 8) : 'Unassigned'); }
        function equipment(id) { return state.equipment.find(x => x.id === id); }
        function available(e) {
          if (Number(e.quantity ?? 1) <= 0 || state.movements.some(row => row.equipment_id === e.id && active(row))) return false;
          return ({ request: ['AVAILABLE'], transfer: ['AVAILABLE','IN_USE'], return: ['IN_USE'], repair: ['AVAILABLE','IN_USE','REPAIR','UNDER_REPAIR'], missing: ['AVAILABLE','IN_USE','REPAIR','UNDER_REPAIR','MISSING'] }[kind]).includes(e.status);
        }
        function options() {
          for (const [name, rows, placeholder, label] of [
            ['equipment',state.equipment.filter(available),'Select equipment',e => `${e.asset_id} — ${e.name}`],
            ['site',state.sites,'Select a site',e => e.name], ['holder',state.profiles,kind === 'request' ? 'Select a holder' : 'No holder — site custody',e => e.name]
          ]) {
            const select = form.elements[name]; if (!select) continue;
            const value = select.value;
            select.innerHTML = `<option value="">${rows.length ? placeholder : 'No ' + (name === 'equipment' ? 'eligible equipment' : name === 'site' ? 'sites' : 'profiles') + ' available'}</option>` + rows.map(row => `<option value="${esc(row.id)}">${esc(label(row))}</option>`).join('');
            select.value = rows.some(x => x.id === value) ? value : '';
          }
          summary();
        }
        function summary() {
          const e = equipment(form.elements.equipment.value);
          root.querySelector('[data-mv-summary]').textContent = e ? `${stateLabel(e.status)} · ${site(e.site_id)} · ${holder(e.current_holder_id)} · Quantity: ${e.quantity ?? 1}` : 'Select equipment to see its current assignment.';
        }
        function actions(row) {
          const out = [];
          if (['pending','approved'].includes(row.workflow_status)) out.push(['cancel','Cancel']);
          if (kind === 'request' && row.workflow_status === 'pending') out.unshift(['approve','Approve']);
          if (kind === 'request' && row.workflow_status === 'approved') out.unshift(['release','Record release']);
          if ((kind === 'request' && row.workflow_status === 'released') || (kind === 'transfer' && row.workflow_status === 'pending')) out.unshift(['receive','Confirm receipt']);
          if (kind === 'repair' && row.workflow_status === 'open') out.push(['repaired','Mark repaired'],['dispose','Dispose']);
          if (kind === 'missing' && row.workflow_status === 'open') out.push(['found','Confirm found']);
          return out.map(([action,label]) => `<button type="button" class="btn btn-sm ${action === 'dispose' ? 'btn-danger' : 'btn-secondary'}" data-mv="transition" data-id="${esc(row.id)}" data-action="${action}" ${state.busy || state.loading ? 'disabled' : ''}>${label}</button>`).join(' ');
        }
        function render() {
          const q = root.querySelector('#mv-search').value.toLowerCase().trim();
          const filter = root.querySelector('#mv-filter').value;
          const all = state.movements.filter(row => row.kind === kind || (kind === 'transfer' && !row.kind));
          const rows = all.filter(row => (!filter || (filter === 'active' ? active(row) : !active(row))) &&
            (!q || [equipment(row.equipment_id)?.name,equipment(row.equipment_id)?.asset_id,site(row.from_site_id),site(row.to_site_id),holder(row.to_user_id),row.notes,row.workflow_status || row.status].join(' ').toLowerCase().includes(q)))
            .sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)) || a.id.localeCompare(b.id));
          const pages = Math.max(1,Math.ceil(rows.length / 10)); state.page = Math.min(state.page,pages);
          root.querySelector('[data-mv-count]').textContent = `${all.length} records`;
          root.querySelector('[data-mv-table]').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Equipment / date</th><th>Assignment / details</th><th>Status / actions</th></tr></thead><tbody>${rows.slice((state.page-1)*10,state.page*10).map(row => {
            const e=equipment(row.equipment_id); const date=new Date(row.created_at);
            const assignment = ['repair','missing'].includes(row.kind)
              ? `At: ${esc(site(row.from_site_id))}<div class="cell-sub">Holder: ${esc(holder(row.from_user_id))}</div>`
              : `${esc(site(row.from_site_id))} → ${esc(site(row.to_site_id))}<div class="cell-sub">${esc(holder(row.from_user_id))} → ${esc(holder(row.to_user_id))}</div>`;
            return `<tr><td><strong class="mono">${esc(e?.asset_id || 'Unavailable equipment')}</strong><div>${esc(e?.name)}</div><div class="cell-sub">${esc(Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString())}</div></td><td>${assignment}<p class="movement-record-note">${esc(row.notes || (row.kind ? '' : 'Legacy transfer; preserved from the existing system.'))}</p>${row.needed_until ? `<div>Needed until: ${esc(row.needed_until)}</div>` : ''}${row.condition ? `<div>Condition: ${esc(row.condition)}</div>` : ''}${row.repair_shop ? `<div>Shop: ${esc(row.repair_shop)}</div>` : ''}${row.repair_cost != null ? `<div>Cost: PHP ${Number(row.repair_cost).toFixed(2)}</div>` : ''}</td><td><span class="badge ${active(row) ? 'badge-pending' : 'badge-available'}">${esc(stateLabel(row.workflow_status || row.status))}</span><div class="movement-actions">${actions(row)}</div></td></tr>`;
          }).join('')}</tbody></table></div>` : '<div class="empty-state">' + (q || filter ? 'No records match your filters.' : 'No ' + kind + ' records yet.') + '</div>';
          root.querySelector('[data-mv-pagination]').innerHTML = `<button type="button" class="btn btn-secondary btn-sm" data-mv="previous" ${state.page<=1?'disabled':''}>Previous</button><span>Page ${state.page} of ${pages}</span><button type="button" class="btn btn-secondary btn-sm" data-mv="next" ${state.page>=pages?'disabled':''}>Next</button>`;
        }
        function lock() { fields.disabled=state.busy||state.loading||state.failed; root.querySelector('[data-mv="refresh"]').disabled=state.busy||state.loading; }
        async function load() {
          const token = ++loadVersion; state.loading=true; lock();
          root.querySelector('[data-mv-table]').textContent='Loading records…';
          try {
            const [eq,sites,profiles,movements] = await Promise.all(['equipment','sites','profiles','equipment_transfers'].map(table=>readAll(client,table,context)));
            if (!current() || token!==loadVersion) return;
            // A populated legacy table lacks these keys until setup is applied;
            // explicitly select kind so an empty legacy table also fails safely.
            const check = await client.from('equipment_transfers').select('kind,workflow_status').limit(1);
            if (check.error) throw check.error;
            if (!current() || token!==loadVersion) return;
            state.equipment=eq; state.sites=sites; state.profiles=profiles; state.movements=movements; state.failed=false;
            options(); render();
          } catch(error) {
            if (!current() || token!==loadVersion) return;
            state.failed=true; feedback(message(error),true); root.querySelector('[data-mv-table]').textContent='Records could not be loaded. Use Refresh to retry.';
          } finally { if (current() && token===loadVersion) { state.loading=false; lock(); renderIfLoaded(); } }
        }
        function renderIfLoaded() { if (!state.failed) render(); }
        async function save(event) {
          event.preventDefault(); if (state.busy || state.loading || state.failed || !form.reportValidity()) return;
          const data=new FormData(form); const notes=String(data.get('notes')||'').trim();
          if (!notes) { feedback('Enter a purpose or notes.',true); return; }
          const e=equipment(data.get('equipment')); if (!e || !available(e)) { feedback('Select eligible equipment. Refresh if its status changed.',true); return; }
          if (kind==='transfer' && data.get('site')===e.site_id) { feedback('Select a destination different from the current site.',true); return; }
          const cost=data.get('cost');
          if (cost && (!Number.isFinite(Number(cost)) || Number(cost)<0)) { feedback('Enter a valid repair cost.',true); return; }
          state.busy=true; lock(); render(); feedback('Saving…');
          try {
            const {error}=await client.rpc('movement_create',{p_id:state.id,p_kind:kind,p_equipment_id:e.id,p_to_site_id:data.get('site')||null,p_to_user_id:data.get('holder')||null,p_notes:notes,p_condition:data.get('condition')||'Good',p_needed_until:data.get('needed')||null,p_repair_shop:data.get('shop')||null,p_repair_cost:cost ? Number(cost) : null});
            if (error) throw error;
            if (!current()) return;
            form.reset(); state.id=crypto.randomUUID(); feedback('Movement saved.'); await load();
          } catch(error) { if(current()) feedback(message(error),true); }
          finally { if(current()) {state.busy=false;lock();renderIfLoaded();} }
        }
        async function transition(button) {
          if (state.busy || state.loading) return;
          const row=state.movements.find(x=>x.id===button.dataset.id); if(!row)return;
          if (['dispose','cancel'].includes(button.dataset.action) && !window.confirm(button.dataset.action==='dispose' ? 'Mark this equipment as disposed? Its history will be retained.' : 'Cancel this pending movement?'))return;
          state.busy=true;lock();render();feedback('Saving…');
          try {
            const {error}=await client.rpc('movement_transition',{p_id:row.id,p_version:row.version,p_action:button.dataset.action});
            if(error)throw error;
            if(!current())return;
            feedback('Movement updated.');await load();
          } catch(error){if(current())feedback(message(error),true);}
          finally{if(current()){state.busy=false;lock();renderIfLoaded();}}
        }
        root.addEventListener('click',event=>{
          const b=event.target.closest('[data-mv]'); if(!b || b.disabled)return;
          if(b.dataset.mv==='refresh'){feedback('');load();}
          if(b.dataset.mv==='previous'){state.page--;render();}
          if(b.dataset.mv==='next'){state.page++;render();}
          if(b.dataset.mv==='transition')transition(b);
        },{signal:controller.signal});
        root.addEventListener('input',event=>{if(event.target.id==='mv-search'){state.page=1;render();}},{signal:controller.signal});
        root.addEventListener('change',event=>{if(event.target.id==='mv-filter'){state.page=1;render();}if(event.target.id==='mv-equipment')summary();},{signal:controller.signal});
        form.addEventListener('submit',save,{signal:controller.signal});
        form.addEventListener('reset',()=>{state.id=crypto.randomUUID();setTimeout(()=>{if(current())summary();},0);},{signal:controller.signal});
        return load();
      },
      destroy() { dispose(); }
    };
  }
  window.MCPA = window.MCPA || {};
  window.MCPA.Movement = { register };
})();
