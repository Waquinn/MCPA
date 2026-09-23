/* Shared public database access and device preferences. Never put privileged keys here. */
(function () {
  'use strict';
  const defaults = { theme: 'light', pageSize: 10, defaultScreen: 'dashboard' };
  const startScreens = ['dashboard', 'masterlist', 'sites', 'consumables', 'request', 'transfer', 'return', 'repair', 'missing', 'purchase', 'reports', 'activity'];
  let preferences = { ...defaults };
  try { preferences = validatePreferences(JSON.parse(localStorage.getItem('mcpa.preferences') || '{}')); }
  catch (_) { /* Invalid or unavailable device storage uses documented defaults. */ }
  function validatePreferences(value) {
    return {
      theme: ['light', 'dark'].includes(value?.theme) ? value.theme : defaults.theme,
      pageSize: [10, 25, 50].includes(Number(value?.pageSize)) ? Number(value.pageSize) : defaults.pageSize,
      defaultScreen: startScreens.includes(value?.defaultScreen) ? value.defaultScreen : defaults.defaultScreen
    };
  }
  function getClient() {
    if (!window.supabaseClient) {
      if (!window.supabase?.createClient) throw new Error('The database connection could not load. Check your connection and refresh.');
      window.supabaseClient = window.supabase.createClient(
        'https://zpqxlmiqwevhlstjirei.supabase.co',
        'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58'
      );
    }
    return window.supabaseClient;
  }
  async function readAll(table, columns = '*', order = 'id') {
    const rows = [];
    for (let offset = 0; ;) {
      const { data, count, error } = await getClient().from(table).select(columns, { count: 'exact' }).order(order).range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data?.length || (count != null && rows.length >= count)) return rows;
      offset += data.length;
    }
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function errorMessage(error, fallback = 'The operation could not be completed. Check your connection and try again.') {
    if (['PGRST205', 'PGRST202', '42703', '42883'].includes(error?.code)) return 'Database setup is incomplete. Ask your administrator to apply the supplied setup scripts, then refresh.';
    if (['42501', 'PGRST301', 'PGRST303'].includes(error?.code)) return 'Your session or database permissions do not allow this action. Sign in again or contact your administrator.';
    if (error?.code === '23505') return 'A record with these details already exists.';
    if (['23503', '23001'].includes(error?.code)) return 'This record is linked to other records. Keep it to preserve its history.';
    if (['23514', '22P02'].includes(error?.code)) return 'Check the values in the form and try again.';
    return fallback;
  }
  function applyPreferences() {
    document.body.classList.toggle('dark', preferences.theme === 'dark');
    const label = document.getElementById('theme-label');
    if (label) label.textContent = preferences.theme === 'dark' ? 'Light mode' : 'Night mode';
    document.querySelector('.theme-toggle')?.setAttribute('aria-pressed', String(preferences.theme === 'dark'));
  }
  function savePreferences(values) {
    const next = validatePreferences({ ...preferences, ...values });
    localStorage.setItem('mcpa.preferences', JSON.stringify(next));
    preferences = next;
    applyPreferences();
    window.dispatchEvent(new CustomEvent('mcpa:preferences', { detail: { ...preferences } }));
    return { ...preferences };
  }
  function notice(message, isError = false) {
    const element = document.getElementById('app-feedback');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('hidden', !message);
    element.classList.toggle('is-error', isError);
    element.setAttribute('role', isError ? 'alert' : 'status');
  }
  window.MCPA = { getClient, readAll, escapeHTML, errorMessage, getPreferences: () => ({ ...preferences }), savePreferences, applyPreferences, notice, session: null, prototype: false };
  window.escapeHTML = escapeHTML;
  window.MCPAModules = window.MCPAModules || {};
})();
