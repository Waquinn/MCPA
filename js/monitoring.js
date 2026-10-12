/* Own-recipient monitoring; configuration failures pause automatic retries. */
(function () {
  'use strict';
  const empty=()=>({notifications:[],overdue:[],unreadCount:0});
  let state=empty(),owner='',revision=0,loading=null,stop=null,dialog=null,error='',blocked=false,busy=false,loaded=false;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const active=()=>window.MCPAAuth?.profile&&!window.MCPAAuth.isDemo&&window.MCPAAuth.canRoute('activity');
  const client=()=>window.EquipmentTracking.client();
  const date=value=>new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
  const configurationError=problem=>['42P01','42883','PGRST202','PGRST205','42501'].includes(problem?.code);
  function message(problem){
    if(['42P01','42883','PGRST202','PGRST205'].includes(problem?.code))return `Notification service is unavailable (${problem.code}). ${problem.message||'A required database function or table is missing.'} Ask your administrator to review the monitoring migration and reload the API schema. Automatic retries are paused.`;
    if(problem?.code==='42501')return 'Notification access was denied (42501). Ask your administrator to check account access and monitoring permissions. Automatic retries are paused.';
    return 'Notifications could not load. Try again. If this continues, contact your administrator.';
  }
  function bell(){
    const button=document.querySelector('.bell-wrap'),dot=button?.querySelector('.bell-dot');
    if(dot)dot.classList.toggle('hidden',!state.unreadCount||!active()||!!error);
    button?.setAttribute('aria-label',error?'Notifications unavailable':busy&&!loaded?'Notifications loading':`Notifications${state.unreadCount?' ('+state.unreadCount+' unread)':''}`);
    button?.setAttribute('aria-expanded',String(!!dialog?.open));button?.setAttribute('aria-haspopup','dialog');button?.setAttribute('aria-controls','monitoring-dialog');
  }
  function route(notice){
    if(notice.kind==='overdue'&&typeof notice.entityId==='string'&&notice.entityId.length<=120)return 'request?record='+encodeURIComponent(notice.entityId);
    if(notice.kind==='movement'&&['request','transfer','return','repair','missing'].includes(notice.data?.route)&&typeof notice.entityId==='string'&&notice.entityId.length<=120)return notice.data.route+'?record='+encodeURIComponent(notice.entityId);
    return ['reports','masterlist'].includes(notice.data?.route)?notice.data.route:'activity';
  }
  function position(){
    if(!dialog?.open)return;
    const anchor=document.querySelector('.bell-wrap')?.getBoundingClientRect(),width=Math.min(420,innerWidth-24);
    dialog.style.width=width+'px';dialog.style.left=Math.max(12,Math.min((anchor?.right||innerWidth-12)-width,innerWidth-width-12))+'px';
    const top=Math.min((anchor?.bottom||56)+10,Math.max(12,innerHeight-220));
    dialog.style.top=top+'px';dialog.style.maxHeight=Math.max(160,Math.min(innerHeight-top-12,innerHeight*.72))+'px';
  }
  function render(){
    if(!dialog?.open)return;
    const focus=dialog.contains(document.activeElement)?document.activeElement:null,focusKey=focus?.getAttribute('data-monitoring-notice');
    const scroll=dialog.querySelector('.monitoring-body')?.scrollTop||0;
    dialog.innerHTML=`<header class="monitoring-head"><div><h2 id="monitoring-title">Notifications</h2><p>${error?'Service unavailable':busy&&!loaded?'Loading updates…':state.unreadCount+' unread'} · Manila time</p></div><button type="button" class="btn btn-secondary" data-monitoring-close>Close</button></header>
      <div class="monitoring-body" aria-busy="${busy}"><p data-monitoring-status role="status">${escape(error||(busy?'Loading notifications…':''))}</p>
      ${error?`<button type="button" class="btn btn-secondary" data-monitoring-retry ${busy?'disabled':''}>${blocked?'Retry after setup':'Try again'}</button>${loaded?'<p class="monitoring-stale">Showing the last loaded updates. Counts may have changed.</p>':''}`:''}
      ${!error&&loaded&&state.overdue.length?`<section class="monitoring-overdue"><h3>Currently overdue</h3>${state.overdue.map(item=>`<p><button type="button" class="btn btn-secondary" data-overdue-request="${escape(item.requestId)}">${escape(item.requestId)}</button><span>${escape(item.toolIds.join(', '))} · ${escape(item.daysOverdue)} days past ${escape(item.neededUntil)}</span></p>`).join('')}</section>`:''}
      ${loaded&&state.notifications.length?`<ol class="monitoring-list" aria-label="Recorded notifications">${state.notifications.map(notice=>`<li><button type="button" class="monitoring-entry ${notice.readAt?'':'is-unread'}" data-monitoring-notice="${escape(notice.id)}"><span class="monitoring-entry-title">${escape(notice.title)}${notice.readAt?'':'<span class="monitoring-unread">Unread</span>'}</span><span class="monitoring-preview">${escape(notice.message)}</span><time datetime="${escape(notice.createdAt)}">${escape(date(notice.createdAt))}</time><span class="monitoring-open">${notice.readAt?'Open record':'Open and mark read'}</span></button></li>`).join('')}</ol>`:!error&&!busy&&loaded?'<div class="monitoring-empty"><h3>You’re up to date</h3><p>No recorded notifications for your account. New updates will appear here.</p></div>':''}</div>
      <footer class="monitoring-footer"><button type="button" class="btn btn-secondary" data-monitoring-activity>Open activity logs</button></footer>`;
    dialog.querySelector('.monitoring-body').scrollTop=scroll;
    if(focus){const restored=focusKey?[...dialog.querySelectorAll('[data-monitoring-notice]')].find(button=>button.dataset.monitoringNotice===focusKey):focus.hasAttribute('data-monitoring-activity')?dialog.querySelector('[data-monitoring-activity]'):dialog.querySelector('[data-monitoring-close]');restored?.focus({preventScroll:true});}
    position();
  }
  function watch(){if(!stop&&active())stop=window.EquipmentTracking.watch(()=>refresh(),()=>{},{tables:['mcpa_notifications']});}
  async function refresh(force=false){
    if(!active()||(blocked&&force!==true))return state;if(loading)return loading;
    const generation=revision,person=window.MCPAAuth.profile.id;busy=true;bell();render();
    loading=(async()=>{
      try{
        const {data,error:problem}=await client().rpc('mcpa_monitoring_snapshot');
        if(generation!==revision||window.MCPAAuth.profile?.id!==person)return state;
        if(problem)throw problem;
        if(!data||!Array.isArray(data.notifications)||!Array.isArray(data.overdue))throw new Error('Invalid monitoring snapshot');
        state={...data,notifications:[...data.notifications].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};error='';blocked=false;loaded=true;watch();
      }catch(problem){if(generation===revision){error=message(problem);blocked=configurationError(problem);if(blocked){stop?.();stop=null;}}}
      finally{if(generation===revision){loading=null;busy=false;bell();render();}}
      return state;
    })();return loading;
  }
  function close(restore=true){if(!dialog?.open)return;dialog.close();bell();if(restore)document.querySelector('.bell-wrap')?.focus();}
  async function selectNotice(id){
    const notice=state.notifications.find(item=>item.id===id);if(!notice||!active())return;
    const generation=revision,person=window.MCPAAuth.profile.id;
    const button=[...dialog.querySelectorAll('[data-monitoring-notice]')].find(item=>item.dataset.monitoringNotice===id);if(button)button.disabled=true;
    try{
      if(!notice.readAt){const {error:problem}=await client().rpc('mcpa_monitoring_mark_read',{p_id:id});if(problem)throw problem;}
      if(generation!==revision||window.MCPAAuth.profile?.id!==person)return;
      if(!notice.readAt){notice.readAt=new Date().toISOString();state.unreadCount=Math.max(0,state.unreadCount-1);}
      const target=route(notice);close();bell();if(window.MCPAAuth.canRoute(target.split('?')[0]))window.showScreen(target);void refresh();
    }catch(problem){if(generation===revision){const feedback=dialog?.querySelector('[data-monitoring-status]');if(feedback)feedback.textContent=configurationError(problem)?message(problem):'This notification could not be opened. Its read state has not been confirmed. Try again.';}}
    finally{if(button?.isConnected)button.disabled=false;}
  }
  async function open(){
    if(window.MCPAAuth?.isDemo){if(window.MCPAAuth.canRoute('activity'))window.showScreen('activity');return;}if(!active())return;
    if(owner!==window.MCPAAuth.profile.id)initialize();
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='monitoring-dialog';dialog.className='monitoring-dialog';dialog.setAttribute('aria-labelledby','monitoring-title');document.body.append(dialog);
      dialog.addEventListener('click',event=>{
        const control=event.target.closest('button');if(!control)return;
        if(control.hasAttribute('data-monitoring-close'))close();
        else if(control.hasAttribute('data-monitoring-retry'))void refresh(true);
        else if(control.hasAttribute('data-monitoring-notice'))void selectNotice(control.dataset.monitoringNotice);
        else if(control.hasAttribute('data-overdue-request')){close();window.showScreen('request?record='+encodeURIComponent(control.dataset.overdueRequest));}
        else if(control.hasAttribute('data-monitoring-activity')){close();window.showScreen('activity');}
      });
    }
    if(dialog.open){close();return;}dialog.show();render();bell();dialog.querySelector('[data-monitoring-close]')?.focus();await refresh();
  }
  function outside(event){if(dialog?.open&&!dialog.contains(event.target)&&!event.target.closest('.bell-wrap'))close(false);}
  function keydown(event){if(dialog?.open&&event.key==='Escape'){event.preventDefault();close();}}
  function dispose(){
    ++revision;stop?.();stop=null;loading=null;owner='';state=empty();error='';blocked=false;loaded=false;busy=false;dialog?.close();dialog?.remove();dialog=null;
    window.removeEventListener('mcpa:movement-change',refresh);window.removeEventListener('resize',position);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keydown);bell();
  }
  function initialize(){
    dispose();if(!active())return;owner=window.MCPAAuth.profile.id;
    window.addEventListener('mcpa:movement-change',refresh);window.addEventListener('resize',position);document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keydown);void refresh();
  }
  window.MCPAMonitoring={initialize,dispose,refresh,open,getState:()=>JSON.parse(JSON.stringify(state))};bell();
})();
