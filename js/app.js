/* ============================================================
   MODULE LOADING
   Maps every screen id (used by showScreen / nav / cross-module
   links) to the module folder that owns it. A couple of detail
   screens (tool-profile, site-detail) are bundled inside a
   parent module's HTML file rather than getting their own folder.
   ============================================================ */
const SCREEN_MODULE = {
  "dashboard":    "dashboard",
  "masterlist":   "masterlist",
  "tool-profile": "masterlist",
  "sites":        "sites",
  "site-detail":  "sites",
  "consumables":  "consumables",
  "request":      "requests",
  "transfer":     "transfers",
  "return":       "returns",
  "repair":       "repairs",
  "missing":      "missing",
  "purchase":     "purchases",
  "reports":      "reports",
  "activity":     "activity",
  "users":        "users",
  "settings":     "settings",
};

let currentModule = null;
let moduleRequest = 0;
let moduleAbort = null;

/* Loads (or reuses, if already the active module) the module that
   owns `screenId`, then calls `callback`. HTML is re-fetched and
   re-inserted whenever the module changes so module scripts
   (e.g. renderMasterlist) always run against fresh markup; the
   module's CSS is only ever attached once. */
function loadModule(screenId, callback){
  if (!window.MCPAAuth?.canRoute(screenId)) { if (window.MCPAAuth?.profile) MCPAAuth.deny(); return; }
  const request = ++moduleRequest;
  const mod = SCREEN_MODULE[screenId];
  if(!mod){
    console.error('Unknown screen: ' + screenId);
    return;
  }
  if(mod === currentModule){
    callback();
    return;
  }

  moduleAbort?.abort();
  moduleAbort = new AbortController();
  window.MovementUI?.dispose();
  window.MovementOverview?.dispose();
  window.TrackingView?.dispose();
  window.MCPAProjects?.dispose();
  window.AdminEquipment?.dispose();
  window.MCPAAccounts?.dispose();
  const relative = location.pathname.includes('/2-engr/') ? '../' : '';
  const user = window.MCPAAuth.profile;
  const operational = MCPAPermissions.operational(user.role);
  let pathPrefix = relative + (operational ? '2-engr/modules/' : '1-admin/modules/');
  if (['sites','consumables','users','settings','reports','purchases'].includes(mod)) pathPrefix = relative + '1-admin/modules/';
  if (mod === 'masterlist' && (operational || user.role === 'tool_handler' || window.MCPAAuth.isDemo)) pathPrefix = relative + '2-engr/modules/';
  const base = pathPrefix + mod + '/' + mod;
  
  document.getElementById('content').setAttribute('aria-busy', 'true');
  fetch(base + '.html', {signal: moduleAbort.signal})
    .then(function(res){ if (!res.ok) throw new Error('Screen could not load (' + res.status + ').'); return res.text(); })
    .then(function(html){
      if (request !== moduleRequest) return;
      document.getElementById('content').innerHTML = html;
      currentModule = mod;
      ensureModuleCSS(mod, base + '.css');
      loadModuleScript(mod, base + '.js', function(){
        if (request !== moduleRequest) return;
        document.getElementById('content').removeAttribute('aria-busy');
        callback();
      });
    })
    .catch(function(err){
      if (err.name === 'AbortError' || request !== moduleRequest) return;
      currentModule = null;
      const content = document.getElementById('content');
      content.removeAttribute('aria-busy');
      content.innerHTML = '<div class="card card-pad" role="alert"><h2>Unable to load this screen</h2><p>Please check your connection and try again.</p><button class="btn btn-secondary" id="retry-module">Retry</button></div>';
      document.getElementById('retry-module').onclick = () => showScreen(screenId);
    });
}

function ensureModuleCSS(mod, href){
  if(document.querySelector('link[data-module="' + mod + '"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href + '?v=' + new Date().getTime();
  link.dataset.module = mod;
  document.head.appendChild(link);
}

function loadModuleScript(mod, src, callback){
  const old = document.querySelector('script[data-module="' + mod + '"]');
  if(old) old.remove();
  const script = document.createElement('script');
  script.src = src + '?v=' + new Date().getTime();
  script.dataset.module = mod;
  script.onload = callback;
  script.onerror = function(){
    console.error('Failed to load script for "' + mod + '"');
    callback();
  };
  document.body.appendChild(script);
}

/* ============================================================
   APP INITIALIZATION
   ============================================================ */
function enterApp(event){ return window.MCPAAuth?.signIn(event); }
function resetApplication(){
  ++moduleRequest; moduleAbort?.abort(); currentModule=null; clearTimeout(searchTimer);
  window.MovementUI?.dispose(); window.MovementOverview?.dispose(); window.TrackingView?.dispose();
  window.MCPAProjects?.dispose(); window.AdminEquipment?.dispose();
  window.MCPAAccounts?.dispose(); closeMobileSearch(false);
  window.mcpaSearch='';
  window.movementDraft=null;
  if (typeof equipmentList !== 'undefined') equipmentList=[];
  if (typeof selectedAssets !== 'undefined') selectedAssets=[];
}
/* ============================================================
   GLOBAL EVENT HANDLING
   ============================================================ */
let themeTransitionRunning = false;
function applyTheme(dark, persist = true){
  document.body.classList.toggle('dark', dark);
  document.getElementById('theme-label').textContent = dark ? 'Light mode' : 'Night mode';
  const button = document.querySelector('.theme-toggle');
  button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to night mode');
  button.title = button.getAttribute('aria-label');
  document.getElementById('theme-icon').innerHTML = ICONS[dark ? 'sun' : 'moon'];
  if(persist) try { localStorage.setItem('mcpa.theme', dark ? 'dark' : 'light'); } catch (_) {}
}
async function toggleTheme(button = document.querySelector('.theme-toggle')){
  if(themeTransitionRunning) return;
  const dark = !document.body.classList.contains('dark');
  if(!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches){ applyTheme(dark); return; }
  const rect = button.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const root = document.documentElement;
  root.style.setProperty('--theme-x', x + 'px'); root.style.setProperty('--theme-y', y + 'px');
  root.style.setProperty('--theme-radius', radius + 'px'); root.classList.add('theme-transition');
  themeTransitionRunning = true;
  try {
    const transition = document.startViewTransition(() => applyTheme(dark));
    transition.ready.catch(() => {});
    await transition.finished;
  } catch (_) { applyTheme(dark); }
  finally {
    root.classList.remove('theme-transition');
    ['--theme-x','--theme-y','--theme-radius'].forEach(name => root.style.removeProperty(name));
    themeTransitionRunning = false;
  }
}

let searchTimer;
function globalSearch(q){
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => showScreen('masterlist', function(){
    window.mcpaSearch = q;
    const input = document.getElementById('movement-inventory-search') || document.getElementById('searchEquipment');
    if(input){ input.value = q; input.dispatchEvent(new Event('input', {bubbles: true})); }
    if (typeof filterAndResetPage === 'function' && document.getElementById('equipmentTableBody')) filterAndResetPage();
  }, {keepSearch:true}), 180);
}

const compactSearch = matchMedia('(max-width: 900px)');
function closeMobileSearch(restoreFocus = true, cancelPending = true){
  const panel = document.getElementById('global-search-panel'), button = document.getElementById('mobile-search-toggle');
  const wasOpen = panel?.classList.contains('is-open');
  panel?.classList.remove('is-open'); button?.setAttribute('aria-expanded','false');
  if(cancelPending) clearTimeout(searchTimer);
  if(wasOpen && restoreFocus && compactSearch.matches) button?.focus();
}
function openMobileSearch(){
  if(!window.MCPAAuth?.canRoute('masterlist')) return;
  const panel = document.getElementById('global-search-panel');
  if(panel.classList.contains('is-open')) { closeMobileSearch(); return; }
  document.getElementById('account-menu')?.removeAttribute('open');
  document.getElementById('sidebar')?.classList.remove('open');
  panel.classList.add('is-open'); document.getElementById('mobile-search-toggle').setAttribute('aria-expanded','true');
  document.getElementById('global-search-input').focus();
}
function updateSearchLayout(){
  const input = document.getElementById('global-search-input');
  const restore = document.activeElement === document.getElementById('mobile-search-toggle');
  closeMobileSearch(false);
  input.placeholder = compactSearch.matches ? 'Search equipment or ID…' : 'Search tool ID, equipment, serial, project, or holder…';
  if(!compactSearch.matches && restore) input.focus();
}
compactSearch.addEventListener('change', updateSearchLayout); updateSearchLayout();
document.getElementById('global-search-panel').addEventListener('keydown', event => {
  if(event.key === 'Escape'){ event.preventDefault(); closeMobileSearch(); }
  if(event.key === 'Enter' && event.target.id === 'global-search-input' && compactSearch.matches){
    event.preventDefault(); globalSearch(event.target.value); closeMobileSearch(true, false);
  }
});
document.addEventListener('click', event => {
  if(event.target.closest('.mobile-menu-btn,.bell-wrap,#account-menu summary')) closeMobileSearch(false);
});

function logout(){ return window.MCPAAuth?.logout(); }
applyTheme(document.body.classList.contains('dark'), false);
window.addEventListener('hashchange', () => {
  const route = location.hash.slice(1);
  const {screen} = window.MCPAMovementLinks.parse(route);
  if (SCREEN_MODULE[screen] && !document.getElementById('app-shell').classList.contains('hidden')) showScreen(route);
});

document.addEventListener('click', event => {
  const link = event.target.closest('a[data-movement-link]');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  // History links can also appear inside the existing equipment detail dialog.
  document.querySelectorAll('.overview-dialog[open]').forEach(dialog => dialog.close());
  showScreen(link.hash.slice(1));
});

// Close sidebar on mobile when clicking outside of it
document.addEventListener('click', function(e) {
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.querySelector('.mobile-menu-btn');
  
  // If the sidebar is open and the click target is NOT the sidebar or the menu button
  if (sidebar && sidebar.classList.contains('open')) {
    if (!sidebar.contains(e.target) && (!menuBtn || !menuBtn.contains(e.target))) {
      sidebar.classList.remove('open');
    }
  }
});

// Close sidebar on mobile when a navigation item is clicked
document.getElementById('sidebar').addEventListener('click', function(e) {
  if (e.target.closest('.nav-item')) {
    this.classList.remove('open');
  }
});
