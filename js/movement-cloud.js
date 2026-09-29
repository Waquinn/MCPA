/* Shared live repository. Demo data is used only after an explicit mode change. */
(function () {
  'use strict';
  const empty = () => ({version: 1, revision: 0, tools: [], sites: [], users: [], requests: [], transfers: [], returns: [], repairs: [], missing: [], activity: []});
  let state = empty(), ready = false, loading = null, saving = false, stale = false;
  let mode = 'live';
  try { if (localStorage.getItem('mcpa.movement.mode') === 'demo') mode = 'demo'; } catch (_) { /* Live reads still work. */ }
  const pending = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const role = () => location.pathname.includes('2-engr') ? 'engineer' : 'admin';
  const notify = () => window.dispatchEvent(new CustomEvent('mcpa:movement-change'));
  function client() {
    if (!window.supabaseClient) {
      if (!window.supabase?.createClient) throw new Error('The database connection could not load. Check your connection and refresh, or explicitly open demo data.');
      window.supabaseClient = window.supabase.createClient('https://zpqxlmiqwevhlstjirei.supabase.co', 'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58');
    }
    return window.supabaseClient;
  }
  function explain(error) {
    if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) return new Error('Movement storage is not set up yet. Run Sites setup.sql, then 1-admin/modules/movements/setup.sql in Supabase, and refresh. You can try the workflow with demo data now.');
    return new Error(error?.message || 'Could not reach movement storage. Your form has been kept; refresh or retry.');
  }
  function context() {
    if (mode === 'demo') return window.MovementDemoStore.getContext();
    let selected;
    try { selected = localStorage.getItem('mcpa.movement.profile.' + role()); } catch (_) { /* Choose a profile before writing. */ }
    const defaultName = role() === 'engineer' ? 'Engr Sky' : 'Engr Pau';
    const user = state.users.find(u => u.id === selected) || state.users.find(u => u.name === defaultName);
    return {role: role(), name: user?.name || '', id: user?.id || null};
  }
  async function refresh() {
    if (mode === 'demo') {
      window.MovementDemoStore.activate();
      return window.MovementDemoStore.refresh();
    }
    if (loading) return loading;
    loading = (async () => {
      const {data, error} = await client().rpc('mcpa_movement_snapshot');
      if (error) throw explain(error);
      if (!data || !Array.isArray(data.tools) || !Array.isArray(data.requests)) throw new Error('The movement database returned an invalid snapshot. Refresh after checking the setup.');
      // Ignore a live response after the user has switched to demo mode.
      if (mode !== 'live') return window.MovementDemoStore.getState();
      state = {...empty(), ...data}; ready = true; stale = false;
      TOOLS.splice(0, TOOLS.length, ...clone(state.tools));
      notify();
      return clone(state);
    })();
    try { return await loading; } finally { loading = null; }
  }
  async function mutate(action, payload) {
    if (mode === 'demo') return window.MovementDemoStore[action](...payload.args);
    if (saving) throw new Error('A movement is already saving. Please wait.');
    if (stale) throw new Error('A movement was saved, but the latest records could not load. Refresh before making another change.');
    if (!ready) await refresh();
    const actor = context();
    if (!actor.id) throw new Error('Choose your profile in the bar above before recording a movement. Profiles must already exist in the database.');
    const values = {...payload.values, actor};
    const key = JSON.stringify([action, values]);
    if (!pending.has(key)) pending.set(key, crypto.randomUUID());
    saving = true;
    try {
      const {data, error} = await client().rpc('mcpa_movement_action', {p_action: action, p_payload: values, p_operation_id: pending.get(key)});
      if (error) throw explain(error);
      try { await refresh(); }
      catch (error) { stale = true; throw new Error('Saved successfully, but the updated records could not load. Refresh before continuing. ' + error.message); }
      pending.delete(key);
      return data;
    } finally { saving = false; }
  }
  const api = {
    get mode() { return mode; },
    getState() { return mode === 'demo' ? window.MovementDemoStore.getState() : clone(state); },
    getContext: context,
    async initialize() { if (mode === 'demo') return window.MovementDemoStore.activate(); return ready ? clone(state) : refresh(); },
    refresh,
    async setMode(value) {
      if (!['live', 'demo'].includes(value)) throw new Error('Unknown data mode.');
      if (saving) throw new Error('Wait for the current movement to finish.');
      localStorage.setItem('mcpa.movement.mode', value);
      const previousMode = mode;
      mode = value; ready = false; state = empty();
      if (previousMode === 'demo' && value === 'live') window.MovementDemoStore.deactivate();
      TOOLS.splice(0, TOOLS.length);
      if (mode === 'demo') window.MovementDemoStore.activate();
      else notify();
      return refresh();
    },
    setContext(id) {
      if (mode !== 'live') return;
      if (!state.users.some(u => u.id === id)) throw new Error('Choose an existing profile.');
      localStorage.setItem('mcpa.movement.profile.' + role(), id); notify();
    },
    findTransfer(code) {
      if (mode === 'demo') return window.MovementDemoStore.findTransfer(code);
      const value = String(code || '').trim().toUpperCase();
      return clone(state.transfers.find(t => t.id === value || t.code === value) || null);
    },
    resolveQr(value) {
      if (mode === 'demo') return window.MovementDemoStore.resolveQr(value);
      const code = String(value || '').trim();
      const actor = context();
      const addressed = transfer => actor.role === 'admin' || (transfer.receiverId ? transfer.receiverId === actor.id : transfer.receiver === actor.name);
      const transfer = api.findTransfer(code);
      if (transfer) {
        if (!addressed(transfer)) throw new Error('Only the named receiver or an administrator can open this handover for receipt.');
        return {kind: 'transfer', transfer};
      }
      const assets = state.tools.filter(tool => tool.id === code);
      if (assets.length !== 1) throw new Error('No unique equipment tag or transfer matches this code. Scan the original tag or enter its exact ID.');
      const asset = assets[0];
      const matches = state.transfers.filter(record => record.status === 'pending' && record.toolIds.includes(asset.id) && addressed(record));
      if (matches.length > 1) throw new Error('This equipment has multiple pending handovers. Use the transfer reference and ask Admin to review the conflict.');
      return matches.length ? {kind: 'transfer', transfer: clone(matches[0]), asset: clone(asset)} : {kind: 'asset', asset: clone(asset), reason: 'No pending handover is addressed to you. Equipment details are available; scanning does not change custody.'};
    }
  };
  ['createRequest', 'createTransfer', 'createReturn', 'reportRepair', 'reportMissing'].forEach(action => {
    api[action] = values => mutate(action, {values, args: [values]});
  });
  ['approveRequest', 'releaseRequest', 'startRepair'].forEach(action => {
    api[action] = id => mutate(action, {values: {id}, args: [id]});
  });
  api.rejectRequest = (id, reason) => mutate('rejectRequest', {values: {id, reason}, args: [id, reason]});
  ['receiveTransfer', 'completeRepair', 'recoverMissing'].forEach(action => {
    api[action] = (id, values = {}) => mutate(action, {values: {id, ...values}, args: [id, values]});
  });
  window.MovementStore = api;
  // Live records refresh when returning to a tab; form controls are not replaced.
  window.addEventListener('focus', () => { if (ready && !saving && mode === 'live') refresh().catch(() => {}); });
  window.addEventListener('storage', event => {
    if (event.key === 'mcpa.movement.mode' && event.newValue !== mode) {
      const previousMode = mode;
      mode = event.newValue === 'demo' ? 'demo' : 'live'; ready = false; state = empty();
      if (previousMode === 'demo') window.MovementDemoStore.deactivate();
      refresh().catch(() => notify());
    } else if (event.key?.startsWith('mcpa.movement.profile.')) notify();
  });
})();
