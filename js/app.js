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
  // Shared inventory modules have one implementation in the Admin folder.
  let pathPrefix = '1-admin/modules/';
  if (window.location.pathname.includes('2-engr')) {
    pathPrefix = ['sites', 'consumables'].includes(mod) ? '../1-admin/modules/' : 'modules/';
  }
  if (mod === 'masterlist' && window.MovementStore?.mode === 'demo') pathPrefix = window.location.pathname.includes('2-engr') ? 'modules/' : '2-engr/modules/';
  
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
function enterApp(){
  const userInput = document.getElementById('userInput').value.trim().toLowerCase();

  // Route based on what the user typed
  if (userInput.includes('engr') || userInput.includes('engineer') || userInput.includes('architect')) {
    // Redirect to the Engineer portal (make sure you create an index.html inside the 2-engr folder)
    window.location.href = '2-engr/index.html';
  } else {
    // Default to the Admin side
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    buildNav();
    showScreen(location.hash.slice(1) in SCREEN_MODULE ? location.hash.slice(1) : 'dashboard');
  }
}

/* ============================================================
   GLOBAL EVENT HANDLING
   ============================================================ */
function toggleTheme(){
  document.body.classList.toggle('dark');
  const dark = document.body.classList.contains('dark');
  document.getElementById('theme-label').textContent = dark ? 'Light mode' : 'Night mode';
  try { localStorage.setItem('mcpa.theme', dark ? 'dark' : 'light'); } catch (_) {}
}

let searchTimer;
function globalSearch(q){
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => showScreen('masterlist', function(){
    window.mcpaSearch = q;
    const input = document.getElementById('movement-inventory-search') || document.getElementById('searchEquipment');
    if(input){ input.value = q; input.dispatchEvent(new Event('input', {bubbles: true})); }
    if (typeof filterAndResetPage === 'function' && document.getElementById('equipmentTableBody')) filterAndResetPage();
  }), 180);
}

function logout(){
  window.MovementUI?.dispose();
  window.location.href = window.location.pathname.includes('2-engr') ? '../index.html' : 'index.html';
}
try { if (localStorage.getItem('mcpa.theme') === 'dark') { document.body.classList.add('dark'); document.getElementById('theme-label').textContent = 'Light mode'; } } catch (_) {}
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (SCREEN_MODULE[id] && !document.getElementById('app-shell').classList.contains('hidden')) showScreen(id);
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
