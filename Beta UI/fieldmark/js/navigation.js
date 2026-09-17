/* ============================================================
   NAVIGATION CONFIG
   ============================================================ */
const NAV = [
  {sec:"Overview"},
  {id:"dashboard", label:"Dashboard", icon:"grid"},
  {sec:"Assets"},
  {id:"masterlist", label:"Masterlist", icon:"list"},
  {id:"sites", label:"Sites", icon:"map"},
  {id:"consumables", label:"Consumables", icon:"box"},
  {sec:"Movement"},
  {id:"request", label:"Requests", icon:"inbox"},
  {id:"transfer", label:"Transfers", icon:"swap"},
  {id:"return", label:"Returns", icon:"undo"},
  {id:"repair", label:"Repairs", icon:"wrench"},
  {id:"missing", label:"Missing", icon:"alert"},
  {sec:"Records"},
  {id:"purchase", label:"Purchases", icon:"cart"},
  {id:"reports", label:"Reports", icon:"chart"},
  {id:"activity", label:"Activity Logs", icon:"clock"},
  {sec:"System"},
  {id:"users", label:"Users", icon:"users"},
  {id:"settings", label:"Settings", icon:"cog"},
];

function buildNav(){
  const el = document.getElementById('nav-list');
  el.innerHTML = NAV.map(n=>{
    if(n.sec) return `<div class="nav-section-label">${n.sec}</div>`;
    return `<div class="nav-item" data-target="${n.id}" onclick="showScreen('${n.id}')">${icon(n.icon)}<span>${n.label}</span></div>`;
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
function showScreen(id, afterActivate){
  loadModule(id, function(){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const target = document.getElementById('screen-'+id);
    if(target) target.classList.add('active');
    setActiveNav(id);
    document.getElementById('content').scrollTop = 0;
    window.scrollTo(0,0);
    if(afterActivate) afterActivate();
  });
}
