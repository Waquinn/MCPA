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

/* Loads (or reuses, if already the active module) the module that
   owns `screenId`, then calls `callback`. HTML is re-fetched and
   re-inserted whenever the module changes so module scripts
   (e.g. renderMasterlist) always run against fresh markup; the
   module's CSS is only ever attached once. */
function loadModule(screenId, callback){
  const mod = SCREEN_MODULE[screenId];
  if(!mod){
    console.error('Unknown screen: ' + screenId);
    return;
  }
  if(mod === currentModule){
    callback();
    return;
  }
  const base = 'modules/' + mod + '/' + mod;
  fetch(base + '.html')
    .then(function(res){ return res.text(); })
    .then(function(html){
      document.getElementById('content').innerHTML = html;
      currentModule = mod;
      ensureModuleCSS(mod, base + '.css');
      loadModuleScript(mod, base + '.js', callback);
    })
    .catch(function(err){ console.error('Failed to load module "' + mod + '"', err); });
}

function ensureModuleCSS(mod, href){
  if(document.querySelector('link[data-module="' + mod + '"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.module = mod;
  document.head.appendChild(link);
}

function loadModuleScript(mod, src, callback){
  const old = document.querySelector('script[data-module="' + mod + '"]');
  if(old) old.remove();
  const script = document.createElement('script');
  script.src = src;
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
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  buildNav();
  showScreen('dashboard');
}

/* ============================================================
   GLOBAL EVENT HANDLING
   ============================================================ */
function toggleTheme(){
  document.body.classList.toggle('dark');
  const dark = document.body.classList.contains('dark');
  document.getElementById('theme-label').textContent = dark ? 'Light mode' : 'Night mode';
}

function globalSearch(q){
  if(!q) return;
  showScreen('masterlist', function(){
    const input = document.getElementById('masterlist-search');
    if(input){ input.value = q; filterMasterlist(); }
  });
}

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