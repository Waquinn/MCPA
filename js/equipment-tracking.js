/* Shared inventory reads and lifecycle-managed Supabase subscriptions. */
(function () {
  'use strict';
  let sequence = 0;
  function client() {
    if (!window.supabaseClient) {
      if (!window.supabase?.createClient) throw new Error('The database connection could not load. Please try again.');
      window.supabaseClient = window.supabase.createClient('https://zpqxlmiqwevhlstjirei.supabase.co', 'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58');
    }
    return window.supabaseClient;
  }
  async function readAll(table, configure = query => query) {
    const rows = [];
    for (let offset = 0; ;) {
      const {data, count, error} = await configure(client().from(table).select('*', {count: 'exact'})).order('id').range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data?.length || (count != null ? rows.length >= count : data.length < 500)) return rows;
      offset += data.length;
    }
  }
  function quantity(tool) {
    const value = Number(tool.quantity ?? tool.qty ?? 1);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  function availability(tool) {
    const status = String(tool.status || '').replace(/[\s_-]/g, '').toUpperCase();
    const project = Object.hasOwn(tool, 'site_id') ? tool.site_id : Object.hasOwn(tool, 'siteId') ? tool.siteId : tool.site;
    if (project && status === 'INUSE') return 'Deployed';
    if (!project || status === 'INOFFICE') return 'Available';
    return 'Unavailable';
  }
  function tally(tools) {
    return tools.reduce((totals, tool) => {
      const units = quantity(tool);
      totals.total += units;
      if (availability(tool) === 'Available') totals.available += units;
      if (availability(tool) === 'Deployed') totals.deployed += units;
      return totals;
    }, {total: 0, available: 0, deployed: 0});
  }
  function matchesStatus(tool, value) {
    if (!value) return true;
    const normalize = status => String(status || '').toLowerCase().replace(/[\s_-]/g, '').replace(/^forrepair$/, 'repair');
    const expected = normalize(value);
    if (expected === 'available') return availability(tool) === 'Available';
    if (['inuse', 'deployed'].includes(expected)) return availability(tool) === 'Deployed';
    return normalize(tool.status) === expected;
  }
  async function snapshot() {
    if (window.MCPAAuth && !window.MCPAPermissions.fullInventory(window.MCPAAuth.profile?.role)) {
      await window.MovementStore.refresh();
      const data=window.MovementStore.getState();
      return {tools:data.tools,sites:data.sites,activeProjects:data.sites.filter(s=>s.is_active!==false)};
    }
    if(window.MCPAAuth) window.MCPAAuth.requireLive();
    const [equipment, sites, activeProjects, profiles] = await Promise.all([
      readAll('equipment'), readAll('sites'),
      readAll('sites', query => query.eq('is_active', true)),
      readAll('profiles', query => query.select('id,name,role', {count:'exact'})).catch(() => [])
    ]);
    const names = new Map(sites.map(site => [site.id, site.name]));
    const holders = new Map(profiles.map(profile => [profile.id, profile.name]));
    return {
      sites, activeProjects,
      tools: equipment.map(item => ({...item, dbId: item.id, id: item.asset_id || item.id,
        qty: quantity(item), cat: item.category, siteId: item.site_id,
        site: names.get(item.site_id) || (item.site_id ? 'Unknown project' : 'Unassigned'),
        holder: holders.get(item.current_holder_id) || item.current_holder_id || '',
        status: String(item.status || '').toLowerCase().replace(/[\s_-]/g, '').replace(/^forrepair$/, 'repair')
      }))
    };
  }
  function watch(reload, onStatus = () => {}) {
    let disposed = false, timer, channel, running = false, pending = false;
    const run = async () => {
      if (disposed) return;
      if (running) { pending = true; return; }
      running = true;
      try { await reload(); }
      catch (error) { if (!disposed) onStatus('Update failed. Retrying automatically.', error); }
      finally {
        running = false;
        if (pending && !disposed) { pending = false; schedule(); }
      }
    };
    const schedule = () => { if (!disposed) { clearTimeout(timer); timer = setTimeout(run, 180); } };
    const visible = () => { if (!document.hidden) schedule(); };
    try {
      const db = client();
      if (typeof db.channel === 'function') {
        channel = db.channel('inventory-' + ++sequence)
          .on('postgres_changes', {event: '*', schema: 'public', table: 'equipment'}, schedule)
          .on('postgres_changes', {event: '*', schema: 'public', table: 'sites'}, schedule);
        channel.subscribe(status => {
          if (disposed) return;
          onStatus(status === 'SUBSCRIBED' ? 'Connected · updates automatically' : 'Reconnecting · checking for updates automatically');
          if (status === 'SUBSCRIBED') schedule();
        });
      }
    } catch (error) { onStatus('Connection unavailable · retrying automatically', error); }
    // Catch missed events after reconnect and installations without Realtime enabled.
    const interval = setInterval(visible, 30000);
    window.addEventListener('focus', visible);
    window.addEventListener('online', visible);
    document.addEventListener('visibilitychange', visible);
    const dispose = () => {
      if (disposed) return;
      disposed = true; clearTimeout(timer); clearInterval(interval);
      window.removeEventListener('focus', visible);
      window.removeEventListener('online', visible);
      window.removeEventListener('pagehide', dispose);
      document.removeEventListener('visibilitychange', visible);
      if (channel) Promise.resolve(client().removeChannel(channel)).catch(() => {});
    };
    window.addEventListener('pagehide', dispose);
    return dispose;
  }
  window.EquipmentTracking = {client, readAll, snapshot, quantity, availability, matchesStatus, tally, watch};
})();
