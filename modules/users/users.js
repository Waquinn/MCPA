(function () {
  'use strict';
  let context, revision=0, profiles=[], page=1, failed=false;
  const q=selector=>context.root.querySelector(selector);
  const R=()=>window.MCPARecords;
  const size=()=>window.MCPA.getPreferences?.().pageSize||25;
  function session() {
    const user=window.MCPA.session?.user, esc=R().esc;
    q('#users-session').innerHTML=user?'<div class="kv"><span class="k">Signed in as</span><span class="v">'+esc(user.email||user.id)+'</span></div><div class="kv"><span class="k">Account ID</span><span class="v">'+esc(user.id)+'</span></div><div class="kv"><span class="k">Last sign-in</span><span class="v">'+esc(R().date(user.last_sign_in_at))+'</span></div>':'<p>Public workspace access. No authenticated user is signed in.</p>';
  }
  function render() {
    const search=q('#users-search').value.toLowerCase().trim();
    const rows=profiles.filter(row=>[R().person(row),row.id,row.role].some(value=>String(value||'').toLowerCase().includes(search))).sort((a,b)=>String(R().person(a)).localeCompare(String(R().person(b))));
    page=Math.max(1,Math.min(page,Math.ceil(rows.length/size())||1));
    R().renderTable(q('#users-head'),q('#users-rows'),['Name','Role','Profile ID'],rows.slice((page-1)*size(),page*size()).map(row=>[R().person(row),row.role||'Not assigned',row.id]),failed?'Profiles could not be loaded. Refresh to retry.':'No profiles to display.');
    q('#users-count').textContent=rows.length+' profiles';
    q('#users-page').textContent='Page '+page+' of '+(Math.ceil(rows.length/size())||1);
    q('[data-action="previous"]').disabled=page<=1;q('[data-action="next"]').disabled=page*size()>=rows.length;
  }
  async function load() {
    const local=context,token=++revision;
    q('[data-action="refresh"]').disabled=true;q('#users-status').textContent='Loading profiles…';session();
    const result=await R().readSources(['profiles']);
    if(!local.isCurrent()||token!==revision)return;
    profiles=result.data.profiles;failed=!!result.errors.profiles;
    q('[data-action="refresh"]').disabled=false;q('#users-status').textContent=R().readableErrors(result.errors)||'Profile directory is up to date.';
    render();
  }
  window.MCPAModules=window.MCPAModules||{};
  window.MCPAModules.users={
    init(next){
      context=next;profiles=[];page=1;failed=false;
      q('#users-search').addEventListener('input',()=>{page=1;render();},{signal:next.signal});
      next.root.addEventListener('click',event=>{
        const button=event.target.closest('button');if(!button||button.disabled)return;
        if(button.dataset.action==='refresh')load();
        if(button.dataset.action==='previous'){page--;render();}
        if(button.dataset.action==='next'){page++;render();}
      },{signal:next.signal});
      window.addEventListener('mcpa:session',()=>{if(next.isCurrent())load();},{signal:next.signal});
      return load();
    },
    destroy(){revision++;context=null;}
  };
})();
