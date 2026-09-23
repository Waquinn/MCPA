(function () {
  'use strict';
  let context, revision = 0;
  async function load() {
    const local = context, token = ++revision, root = local.root, R = window.MCPARecords;
    const statusNode = root.querySelector('#dashboard-status');
    root.querySelector('[data-action="refresh"]').disabled = true;
    statusNode.textContent = 'Loading overview…';
    const { data, errors } = await R.readSources(['equipment', 'sites', 'consumables', 'equipment_transfers']);
    if (!local.isCurrent() || token !== revision) return;
    root.querySelector('[data-action="refresh"]').disabled = false;
    statusNode.textContent = R.readableErrors(errors) || 'Updated ' + new Date().toLocaleTimeString() + '. Equipment totals include grouped quantities.';
    const equipment = data.equipment, counts = {};
    equipment.forEach(row => { const key = String(row.status || 'UNSPECIFIED').toUpperCase(); counts[key] = (counts[key] || 0) + R.quantity(row); });
    const total = equipment.reduce((sum, row) => sum + R.quantity(row), 0);
    const kpis = [['Equipment units', total], ['Equipment records', equipment.length], ['Available units', counts.AVAILABLE || 0], ['In use units', counts.IN_USE || 0], ['Sites', data.sites.length]];
    root.querySelector('#dashboard-kpis').innerHTML = kpis.map(([title, number], index) => '<div class="card kpi"><div class="num">' + (errors[index === 4 ? 'sites' : 'equipment'] ? '—' : R.esc(number)) + '</div><div class="lbl">' + R.esc(title) + '</div></div>').join('');
    const pending = data.equipment_transfers.filter(row => String(row.workflow_status || row.status).toLowerCase() === 'pending');
    const alerts = [
      ['request', 'Requests awaiting review', pending.filter(row => row.kind === 'request').length, 'equipment_transfers'],
      ['transfer', 'Transfers awaiting completion', pending.filter(row => row.kind === 'transfer' || !row.kind).length, 'equipment_transfers'],
      ['missing', 'Missing equipment units', counts.MISSING || 0, 'equipment'],
      ['repair', 'Equipment units requiring repair', (counts.REPAIR || 0) + (counts.FOR_REPAIR || 0) + (counts.UNDER_REPAIR || 0), 'equipment'],
      ['consumables', 'Consumables below minimum or out of stock', data.consumables.filter(row => Number(row.current_stock) === 0 || Number(row.current_stock) < Number(row.minimum_stock)).length, 'consumables']
    ];
    root.querySelector('#dashboard-alerts').innerHTML = alerts.map(([screen, title, count, source]) => '<button class="alert-item" data-screen="' + screen + '" style="width:100%;text-align:left"><span class="txt">' + R.esc(title) + '</span><span class="cnt">' + (errors[source] ? 'Unavailable' : R.esc(count)) + '</span></button>').join('');
    root.querySelector('#dashboard-distribution').innerHTML = errors.equipment ? 'Equipment could not be loaded.' : Object.keys(counts).length ? Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => '<div class="kv"><span class="k">' + R.esc(R.status(key)) + '</span><span class="v">' + R.esc(count) + ' units</span></div>').join('') : 'No equipment has been registered.';
    const siteRows = data.sites.map(site => {
      const items = equipment.filter(item => String(item.site_id) === String(site.id));
      return [site.name, R.status(site.status), errors.equipment ? '—' : items.length, errors.equipment ? '—' : items.reduce((sum, item) => sum + R.quantity(item), 0)];
    });
    const unassigned = equipment.filter(item => !item.site_id);
    if (unassigned.length) siteRows.push(['Unassigned', '—', unassigned.length, unassigned.reduce((sum, item) => sum + R.quantity(item), 0)]);
    R.renderTable(root.querySelector('#dashboard-site-head'), root.querySelector('#dashboard-sites'), ['Site', 'Status', 'Records', 'Units'], siteRows, errors.sites ? 'Sites could not be loaded.' : 'No sites have been created.');
  }
  window.MCPAModules = window.MCPAModules || {};
  window.MCPAModules.dashboard = {
    init(next) {
      context = next;
      next.root.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button?.dataset.screen) window.showScreen(button.dataset.screen);
        if (button?.dataset.action === 'refresh') load();
      }, { signal: next.signal });
      return load();
    },
    destroy() { revision++; context = null; }
  };
})();
