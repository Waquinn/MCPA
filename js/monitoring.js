/* Own-recipient monitoring notices. Reads only; marking read uses its narrow RPC. */
(function () {
  'use strict';
  let state={notifications:[],overdue:[],unreadCount:0}, owner='',revision=0,loading=null,stop=null,dialog=null,error='';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const active=()=>window.MCPAAuth?.profile && !window.MCPAAuth.isDemo && window.MCPAAuth.canRoute('activity');
  const client=()=>window.EquipmentTracking.client();
  const date=value=>new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
  function bell(){
    const button=document.querySelector('.bell-wrap'),dot=button?.querySelector('.bell-dot');
    if(dot)dot.classList.toggle('hidden',!state.unreadCount||!active()||!!error);
    button?.setAttribute('aria-label',error?'Monitoring notifications unavailable':`Notifications${state.unreadCount?' ('+state.unreadCount+' unread)':''}`);
  }
  function message(problem){
    return ['42P01','42883','PGRST202','PGRST205'].includes(problem?.code)
      ? 'Monitoring notifications are not configured yet. Contact your administrator.'
      : 'Notifications could not load. Check your connection and try again.';
  }
  function route(notice){
    if(notice.kind==='overdue' && typeof notice.entityId==='string' && notice.entityId.length<=120)return 'request?record='+encodeURIComponent(notice.entityId);
    if(notice.kind==='movement' && ['request','transfer','return','repair','missing'].includes(notice.data?.route)
      && typeof notice.entityId==='string' && notice.entityId.length<=120)return notice.data.route+'?record='+encodeURIComponent(notice.entityId);
    return ['reports','masterlist'].includes(notice.data?.route)?notice.data.route:'activity';
  }
  function render(){
    if(!dialog?.open)return;
    dialog.innerHTML=`<div class="page-head"><div><h2 id="monitoring-title">Notifications</h2><p class="sub">${state.unreadCount} unread · Dates use Manila time</p></div><button type="button" class="btn btn-secondary" data-monitoring-close autofocus>Close</button></div>
      <p data-monitoring-status role="status">${escape(error)}</p>
      ${error?'<button type="button" class="btn btn-secondary" data-monitoring-retry>Try again</button>':''}
      ${state.overdue.length?`<section><h3>Currently overdue</h3>${state.overdue.map(item=>`<p><button type="button" class="btn btn-secondary btn-sm" data-overdue-request="${escape(item.requestId)}">${escape(item.requestId)}</button> ${escape(item.toolIds.join(', '))} · ${escape(item.daysOverdue)} day${item.daysOverdue===1?'':'s'} past ${escape(item.neededUntil)}</p>`).join('')}</section>`:''}
      <section aria-label="Recorded notifications">${state.notifications.length?state.notifications.map(notice=>`<article class="card card-pad" style="margin:12px 0"><h3>${escape(notice.title)}${notice.readAt?'':' · Unread'}</h3><p>${escape(notice.message)}</p><p class="sub">${escape(date(notice.createdAt))}</p><button type="button" class="btn btn-secondary btn-sm" data-monitoring-notice="${escape(notice.id)}">Open${notice.readAt?'':' and mark read'}</button></article>`).join(''):'<p class="account-message">No recorded monitoring notifications.</p>'}</section>
      <button type="button" class="btn btn-secondary" data-monitoring-activity>Open activity logs</button>`;
  }
  async function refresh(){
    if(!active())return state;
    if(loading)return loading;
    const generation=revision,person=window.MCPAAuth.profile.id;
    loading=(async()=>{
      try{
        const {data,error:problem}=await client().rpc('mcpa_monitoring_snapshot');
        if(generation!==revision||window.MCPAAuth.profile?.id!==person)return state;
        if(problem)throw problem;
        if(!data||!Array.isArray(data.notifications)||!Array.isArray(data.overdue))throw new Error('Invalid monitoring snapshot');
        state=data;error='';bell();render();
        return state;
      }catch(problem){
        if(generation===revision){error=message(problem);bell();render();}
        return state;
      }finally{if(generation===revision)loading=null;}
    })();
    return loading;
  }
  function close(){dialog?.close();}
  async function selectNotice(id){
    const notice=state.notifications.find(item=>item.id===id);if(!notice||!active())return;
    const generation=revision,person=window.MCPAAuth.profile.id;
    const button=dialog?.querySelector(`[data-monitoring-notice="${id}"]`);if(button)button.disabled=true;
    try{
      if(!notice.readAt){
        const {error:problem}=await client().rpc('mcpa_monitoring_mark_read',{p_id:id});
        if(problem)throw problem;
      }
      if(generation!==revision||window.MCPAAuth.profile?.id!==person)return;
      const target=route(notice),screen=target.split('?')[0];
      await refresh();close();
      if(window.MCPAAuth.canRoute(screen))window.showScreen(target);
    }catch(_){
      if(generation===revision){const feedback=dialog?.querySelector('[data-monitoring-status]');if(feedback)feedback.textContent='This notification could not be opened. Your read state has not been confirmed; try again.';}
    }finally{if(button?.isConnected)button.disabled=false;}
  }
  async function open(){
    if(window.MCPAAuth?.isDemo){if(window.MCPAAuth.canRoute('activity'))window.showScreen('activity');return;}
    if(!active())return;
    if(owner!==window.MCPAAuth.profile.id)initialize();
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='monitoring-dialog';dialog.className='card monitoring-dialog';
      dialog.setAttribute('aria-labelledby','monitoring-title');
      dialog.style.cssText='width:min(680px,calc(100% - 32px));max-height:80vh;overflow:auto;padding:24px;color:var(--black);background:var(--white);';
      document.body.append(dialog);
      dialog.addEventListener('click',event=>{
        const control=event.target.closest('button');if(!control)return;
        if(control.hasAttribute('data-monitoring-close'))close();
        else if(control.hasAttribute('data-monitoring-retry'))void refresh();
        else if(control.hasAttribute('data-monitoring-notice'))void selectNotice(control.dataset.monitoringNotice);
        else if(control.hasAttribute('data-overdue-request')){close();window.showScreen('request?record='+encodeURIComponent(control.dataset.overdueRequest));}
        else if(control.hasAttribute('data-monitoring-activity')){close();window.showScreen('activity');}
      });
    }
    if(!dialog.open)dialog.showModal();render();await refresh();
  }
  function dispose(){
    ++revision;stop?.();stop=null;loading=null;owner='';state={notifications:[],overdue:[],unreadCount:0};error='';
    dialog?.close();dialog?.remove();dialog=null;
    window.removeEventListener('mcpa:movement-change',refresh);bell();
  }
  function initialize(){
    dispose();if(!active())return;
    owner=window.MCPAAuth.profile.id;
    stop=window.EquipmentTracking.watch(refresh,()=>{},{tables:['mcpa_notifications']});
    window.addEventListener('mcpa:movement-change',refresh);void refresh();
  }
  window.MCPAMonitoring={initialize,dispose,refresh,open,getState:()=>JSON.parse(JSON.stringify(state))};
  bell();
})();
