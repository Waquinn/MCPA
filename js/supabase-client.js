/* All portals and modules share this lazily initialized, public-key client. */
(function () {
  'use strict';
  window.MCPADatabase = {
    client() {
      if (window.supabaseClient) return window.supabaseClient;
      const config = window.MCPA_CONFIG;
      if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
        throw new Error('Database configuration is missing. Run npm run configure, then refresh.');
      }
      const key = config.supabasePublishableKey;
      let anonymous = false;
      try { anonymous = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch (_) {}
      if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !anonymous) {
        throw new Error('A Supabase publishable or anon key is required for the browser.');
      }
      if (!window.supabase?.createClient) throw new Error('The database service could not load. Check your connection and refresh.');
      window.supabaseClient = window.supabase.createClient(config.supabaseUrl, key);
      return window.supabaseClient;
    }
  };
})();
