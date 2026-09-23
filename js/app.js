/* Scripts register once; each new DOM tree receives its own init/destroy lifecycle. */
const SCREEN_MODULE = {
  dashboard: 'dashboard', masterlist: 'masterlist', 'tool-profile': 'masterlist',
  sites: 'sites', 'site-detail': 'sites', consumables: 'consumables',
  request: 'requests', transfer: 'transfers', return: 'returns', repair: 'repairs',
  missing: 'missing', purchase: 'purchases', reports: 'reports', activity: 'activity',
  users: 'users', settings: 'settings'
};
let currentModule = null;
let currentMount = null;
let navigationRevision = 0;
let pendingNavigation = null;
let accountRevision = 0;
let pendingAuthOperation = null;
let inFlightSignIns = 0;
const moduleScripts = new Map();

function ensureModuleCSS(mod, href) {
  if (document.querySelector('link[data-module="' + mod + '"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href; link.dataset.module = mod;
  document.head.appendChild(link);
}
function loadModuleScript(mod, src) {
  if (!moduleScripts.has(mod)) {
    moduleScripts.set(mod, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.dataset.module = mod;
      script.onload = resolve;
      script.onerror = () => { moduleScripts.delete(mod); script.remove(); reject(new Error('Module script could not load.')); };
      document.body.appendChild(script);
    }));
  }
  return moduleScripts.get(mod);
}
function destroyModule() {
  if (currentMount) {
    currentMount.controller.abort();
    try { window.MCPAModules[currentModule]?.destroy?.(); }
    catch (error) { console.error('Module cleanup failed', error); }
  }
  currentModule = null; currentMount = null;
}
async function loadModule(screenId, activate) {
  const mod = SCREEN_MODULE[screenId];
  if (!mod) { MCPA.notice('That page is not available.', true); return false; }
  const revision = ++navigationRevision;
  pendingNavigation?.abort();
  pendingNavigation = new AbortController();
  const content = document.getElementById('content');
  try {
    if (currentModule === mod && currentMount) {
      activate();
      await currentMount.ready;
      return revision === navigationRevision;
    }
    destroyModule();
    content.innerHTML = '<div class="card card-pad" role="status">Loading page…</div>';
    MCPA.notice('');
    const base = 'modules/' + mod + '/' + mod;
    const response = await fetch(base + '.html', { signal: pendingNavigation.signal });
    if (!response.ok) throw new Error('Module HTML request failed: ' + response.status);
    const html = await response.text();
    await loadModuleScript(mod, base + '.js');
    if (revision !== navigationRevision) return false;
    if (!window.MCPAModules[mod]?.init) throw new Error('Module did not register its initializer.');
    ensureModuleCSS(mod, base + '.css');
    content.innerHTML = html;
    const mount = { controller: new AbortController(), ready: null };
    currentModule = mod; currentMount = mount;
    const context = { root: content, signal: mount.controller.signal, isCurrent: () => currentMount === mount && !mount.controller.signal.aborted };
    activate();
    mount.ready = Promise.resolve(window.MCPAModules[mod]?.init?.(context));
    await mount.ready;
    return revision === navigationRevision;
  } catch (error) {
    if (revision !== navigationRevision || error?.name === 'AbortError') return false;
    console.error('Page load failed', mod, error);
    destroyModule();
    content.innerHTML = '<div class="card empty-state"><p class="t">Unable to open this page</p><p class="d">Check your connection and try again.</p><button class="btn btn-secondary" id="retry-module">Try Again</button></div>';
    document.getElementById('retry-module').onclick = () => showScreen(screenId);
    return false;
  }
}

function updateAccountDisplay() {
  const user = MCPA.session?.user;
  const name = MCPA.profile?.name || user?.user_metadata?.name || user?.email || 'Public workspace';
  document.querySelector('.sidebar-foot .name').textContent = name;
  document.querySelector('.sidebar-foot .role').textContent = user ? 'Signed in' : 'Prototype access';
  document.querySelectorAll('#app-shell .avatar').forEach(el => { el.textContent = user ? name.slice(0, 1).toUpperCase() : 'P'; });
  window.dispatchEvent(new CustomEvent('mcpa:session', { detail: MCPA.session }));
}
function enterApp(session = null) {
  const revision = ++accountRevision;
  pendingAuthOperation = null;
  MCPA.profile = null;
  MCPA.session = session;
  MCPA.prototype = !session;
  try { if (MCPA.prototype) sessionStorage.setItem('mcpa.prototype', '1'); else sessionStorage.removeItem('mcpa.prototype'); } catch (_) {}
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('login-password').value = '';
  updateAccountDisplay();
  if (session?.user) {
    const userId = session.user.id;
    MCPA.getClient().from('profiles').select('id,name,role').eq('id', userId).then(({data,error}) => {
      if (!error && revision === accountRevision && !MCPA.profile && MCPA.session?.user.id === userId) { MCPA.profile = data?.[0] || null; updateAccountDisplay(); }
    }).catch(() => { /* The session identity remains visible if profiles are restricted. */ });
  }
  buildNav();
  return showScreen(MCPA.getPreferences().defaultScreen);
}
function loginFeedback(message) {
  const element = document.getElementById('login-feedback');
  element.textContent = message; element.classList.toggle('hidden', !message);
}
async function signInApp(event) {
  event.preventDefault();
  const button = document.getElementById('login-submit');
  if (button.disabled || inFlightSignIns) return;
  const operation = { kind: 'sign-in', revision: ++accountRevision };
  pendingAuthOperation = operation;
  ++inFlightSignIns;
  button.disabled = true; loginFeedback('');
  try {
    const { data, error } = await MCPA.getClient().auth.signInWithPassword({ email: document.getElementById('login-email').value.trim(), password: document.getElementById('login-password').value });
    if (pendingAuthOperation !== operation || operation.revision !== accountRevision) {
      // Supabase cannot cancel an in-flight password request. Clear its late
      // session if the user has already returned to sign-in/prototype access.
      if (data?.session && !MCPA.session && !pendingAuthOperation) await MCPA.getClient().auth.signOut();
      return;
    }
    if (error || !data?.session) throw error || new Error('No session');
    await enterApp(data.session);
  } catch (error) { if (pendingAuthOperation === operation) { console.error('Sign in failed', error?.code || error?.name); loginFeedback('Sign in failed. Check your email and password, then try again.'); } }
  finally { --inFlightSignIns; if (pendingAuthOperation === operation) pendingAuthOperation = null; if (!pendingAuthOperation) button.disabled = false; }
}
function showLogin() {
  ++accountRevision; pendingAuthOperation = null;
  clearTimeout(searchTimer);
  ++navigationRevision; pendingNavigation?.abort(); destroyModule();
  document.getElementById('content').innerHTML = '';
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  MCPA.session = null; MCPA.profile = null; MCPA.prototype = false;
  try { sessionStorage.removeItem('mcpa.prototype'); } catch (_) {}
  MCPA.notice(''); loginFeedback('');
  document.getElementById('login-password').value = '';
  document.getElementById('login-submit').disabled = inFlightSignIns > 0;
}
async function logoutApp() {
  const wasSigningIn = pendingAuthOperation?.kind === 'sign-in';
  const operation = { kind: 'sign-out', revision: ++accountRevision };
  pendingAuthOperation = operation;
  try {
    if (MCPA.session || wasSigningIn) { const { error } = await MCPA.getClient().auth.signOut(); if (error) throw error; }
    if (pendingAuthOperation === operation && operation.revision === accountRevision) showLogin();
  } catch (error) { if (pendingAuthOperation === operation) MCPA.notice('Sign out could not complete. Check your connection and try again.', true); }
  finally { if (pendingAuthOperation === operation) pendingAuthOperation = null; }
}
function toggleTheme() {
  try { MCPA.savePreferences({ theme: document.body.classList.contains('dark') ? 'light' : 'dark' }); }
  catch (_) { MCPA.notice('Your browser could not save this preference. Enable local storage and try again.', true); }
}
let searchTimer;
function globalSearch(query) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => showScreen('masterlist', () => {
    const input = document.getElementById('searchEquipment');
    if (input) { input.value = query; input.dispatchEvent(new Event('input', { bubbles: true })); }
  }), 250);
}
document.addEventListener('click', event => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && !event.target.closest('.mobile-menu-btn')) sidebar.classList.remove('open');
});
document.getElementById('sidebar').addEventListener('click', function (event) {
  if (event.target.closest('.nav-item')) this.classList.remove('open');
});
(async function initializeApp() {
  MCPA.applyPreferences();
  const revision = accountRevision;
  try {
    const auth = MCPA.getClient().auth;
    if (auth) {
      auth.onAuthStateChange((event, session) => {
        // Avoid awaiting Supabase operations inside its auth callback.
        if (pendingAuthOperation || event === 'INITIAL_SESSION' || (event === 'SIGNED_IN' && inFlightSignIns)) return;
        if (event === 'SIGNED_OUT' && MCPA.session) { showLogin(); return; }
        if (!session) return;
        if (MCPA.session?.user.id === session.user.id) {
          MCPA.session = session; MCPA.prototype = false; updateAccountDisplay();
        } else {
          const expectedRevision = ++accountRevision;
          MCPA.session = session; MCPA.profile = null; MCPA.prototype = false;
          setTimeout(() => { if (expectedRevision === accountRevision && !pendingAuthOperation) enterApp(session); }, 0);
        }
      });
      const { data, error } = await auth.getSession();
      if (revision !== accountRevision || pendingAuthOperation) {
        if (data?.session && !MCPA.session && !pendingAuthOperation) await auth.signOut();
        return;
      }
      if (error) throw error;
      if (data?.session) { await enterApp(data.session); return; }
    }
    if (revision === accountRevision && !MCPA.session && sessionStorage.getItem('mcpa.prototype') === '1') await enterApp();
  } catch (error) { if (revision === accountRevision) loginFeedback('The session could not be restored. Check your connection and sign in again.'); }
})();
