/* ============================================================
   NAVIGATION CONFIG
   ============================================================ */
/* ============================================================
   NAVIGATION CONFIG
   ============================================================ */
// 1. The full menu for Admins
const ADMIN_NAV = [
  {sec:"Overview"},
  {id:"dashboard", label:"Dashboard", icon:"grid"},
  {sec:"Assets"},
  {id:"masterlist", label:"Equipment Tracking", icon:"list"},
  {id:"sites", label:"Projects", icon:"map"},
  
  {sec:"Movement"},
  {id:"request", label:"Requests", icon:"inbox"},
  {id:"transfer", label:"Transfers", icon:"swap"},
  {id:"return", label:"Returns", icon:"undo"},
  {id:"repair", label:"Repairs", icon:"wrench"},
  {id:"missing", label:"Missing", icon:"alert"},
  {sec:"Materials"},
  {id:"consumables", label:"Material Requests", icon:"box"},
  {sec:"Records"},
  {id:"purchase", label:"Purchases", icon:"cart"},
  {id:"reports", label:"Reports", icon:"chart"},
  {id:"activity", label:"Activity Logs", icon:"clock"},
  {sec:"System"},
  {id:"users", label:"People & Accountability", icon:"users"},
  {id:"settings", label:"Settings", icon:"cog"},
];

// 2. The restricted menu for Engineers (Customize this as needed!)
const ENGR_NAV = [
  {sec:"Overview"},
  {id:"dashboard", label:"Dashboard", icon:"grid"},
  {sec:"Assets"},
  {id:"masterlist", label:"Equipment Tracking", icon:"list"},
  {id:"sites", label:"Projects", icon:"map"},
  
  {sec:"Movement"},
  {id:"request", label:"Requests", icon:"inbox"},
  {id:"transfer", label:"Transfers", icon:"swap"},
  {id:"return", label:"Returns", icon:"undo"},
  {id:"repair", label:"Repairs", icon:"wrench"},
  {id:"missing", label:"Missing", icon:"alert"},
  {sec:"Materials"},
  {id:"consumables", label:"Material Requests", icon:"box"},
  {sec:"Records"},
  {id:"activity", label:"Activity Logs", icon:"clock"},
  {id:"settings", label:"Settings", icon:"cog"},
  // Notice that Records, Purchases, Reports, and System sections are removed here
];

function buildNav(){
  const el = document.getElementById('nav-list');
  
  const role = window.MCPAAuth?.profile?.role;
  const source = MCPAPermissions.operational(role) ? ENGR_NAV : ADMIN_NAV;
  const currentNav = source.filter(n => !n.id || window.MCPAAuth.canRoute(n.id)).filter((n,index,list) => n.id || list[index+1]?.id);
  el.innerHTML = currentNav.map(n=>{
    if(n.sec) return `<div class="nav-section-label">${n.sec}</div>`;
    return `<button type="button" class="nav-item" data-target="${n.id}" onclick="showScreen('${n.id}')">${icon(n.icon)}<span>${n.label}</span></button>`;
  }).join('');
}

function setActiveNav(id){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.target===id));
}

/* ============================================================
   SCREEN SWITCHING
   Loads the owning module (see js/app.js) if it isn't already
   in the DOM, then activates the requested screen within it.
   ============================================================ */
// Existing activity already carries an action and stable entityId. Resolve its
// record type from the snapshot, never from human-readable notification text.
window.MCPAMovementLinks = {
  collections: {request:'requests', transfer:'transfers', return:'returns', repair:'repairs', missing:'missing'},
  href(event, snapshot) {
    if (typeof event.entityId !== 'string' || !event.entityId || event.entityId.length > 120) return '';
    const known = Object.entries(this.collections).find(([,collection]) => snapshot[collection]?.some(record => record.id === event.entityId));
    const actions = {
      createRequest:'request', approveRequest:'request', rejectRequest:'request',
      releaseRequest:'transfer', createTransfer:'transfer', receiveTransfer:'transfer',
      createReturn:'return', reportRepair:'repair', startRepair:'repair', completeRepair:'repair',
      reportMissing:'missing', recoverMissing:'missing',
      request_created:'request', request_approved:'request', request_rejected:'request',
      transfer_created:'transfer', transfer_received:'transfer', return_created:'return',
      repair_reported:'repair', repair_started:'repair', repair_completed:'repair',
      missing_reported:'missing', missing_recovered:'missing'
    };
    const kind = known?.[0] || (Object.hasOwn(actions, event.action) ? actions[event.action] : '');
    return kind ? '#' + kind + '?record=' + encodeURIComponent(event.entityId) : '';
  },
  parse(value) {
    const [screen, query = ''] = String(value).replace(/^#/, '').split('?');
    const record = new URLSearchParams(query).get('record');
    return {screen, record: Object.hasOwn(this.collections, screen) && record && record.length <= 120 ? record : ''};
  }
};

function showScreen(route, afterActivate, options){
  const {screen:id, record} = window.MCPAMovementLinks.parse(route);
  if (!window.MCPAAuth?.canRoute(id)) { if (window.MCPAAuth?.profile) { resetApplication(); MCPAAuth.deny(); } return; }
  window.MovementUI?.cancelTarget();
  const hash = '#' + id + (record ? '?record=' + encodeURIComponent(record) : '');
  if (location.hash !== hash) history.replaceState(null, '', hash);
  if(!options?.keepSearch) window.closeMobileSearch?.(false);
  window.MCPADrawer?.close(false);
  loadModule(id, function(){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const target = document.getElementById('screen-'+id);
    if(target) target.classList.add('active');
    document.getElementById('sidebar')?.classList.remove('open');
    setActiveNav(id);
    document.getElementById('content').scrollTop = 0;
    window.scrollTo(0,0);
    if(afterActivate) afterActivate();
    if(record) void window.MovementUI?.openRecord(id, record);
  }, route);
}

