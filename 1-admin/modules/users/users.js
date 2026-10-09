(function () {
  'use strict';
  const root = document.getElementById('screen-users');
  if (!root || !MCPAAuth.canRoute('users') || MCPAAuth.isDemo) return;
  const esc = MovementOverview.escape, client = EquipmentTracking.client();
  const roles = Object.entries(MCPAPermissions.labels).filter(([role]) => role !== 'admin');
  const roleOptions = () => roles.map(([role,label]) => `<option value="${role}">${label}</option>`).join('');
  let records = [], busy = false, invitationId = crypto.randomUUID(), developmentId = crypto.randomUUID(), capabilities = null;
  root.innerHTML = `<div class="page-head"><div><h1 class="display">People & Accountability</h1><p class="sub">Manage company access and preserve each person’s accountability history.</p></div><button class="btn btn-primary" data-open-invite>Invite User</button></div>
    <p id="accounts-feedback" role="status" aria-live="polite"></p>
    <p id="account-availability" class="account-message" role="status">Checking account creation availability…</p>
    <section class="card card-pad"><div class="account-tools"><div class="field"><label for="people-search">Find a person</label><input id="people-search" type="search" placeholder="Name, email or role"></div><button class="btn btn-secondary" data-refresh>Refresh</button></div><div id="accounts-list" aria-busy="true">Loading people…</div></section>
    <section id="invite-panel" class="card card-pad account-section" hidden><h2>Invite User</h2><p class="account-message">Select an existing person when they already have company records. They’ll receive an email to set their password.</p>
    <form id="invite-form" class="account-form"><div class="field account-wide"><label for="invite-person">Company person</label><select id="invite-person"><option value="">Create a new company person</option></select></div>
    <div class="field"><label for="invite-name">Full name</label><input id="invite-name" required maxlength="120" autocomplete="name"></div><div class="field"><label for="invite-email">Email</label><input id="invite-email" type="email" required maxlength="254" autocomplete="email"></div>
    <div class="field"><label for="invite-role">Authorized role</label><select id="invite-role" required><option value="">Choose a role</option>${roleOptions()}</select></div>
    <label class="account-wide" id="distinct-person-label" hidden><input id="distinct-person" type="checkbox"> This is a different person who shares an existing person’s name.</label>
    <div class="account-wide account-tools"><button class="btn btn-primary" type="submit">Send Invitation</button><button class="btn btn-secondary" type="button" data-close-invite>Cancel</button></div></form></section>
    <section id="development-panel" class="card card-pad account-section" hidden><h2>Development / Testing Only</h2>
    <p class="account-message">Create a real test login without sending email. Use a distinct test name and an email reserved for testing. These accounts access live records; deactivate them in Edit access when testing is finished.</p>
    <form id="development-form" class="account-form">
    <div class="field"><label for="development-name">Full name</label><input id="development-name" required maxlength="120" autocomplete="off"></div>
    <div class="field"><label for="development-email">Email</label><input id="development-email" type="email" required maxlength="254" autocomplete="off"></div>
    <div class="field"><label for="development-password">Temporary password</label><div class="auth-password-wrap account-password-wrap"><input id="development-password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" aria-describedby="development-password-help"><button id="development-password-toggle" class="auth-password-toggle account-password-toggle" type="button" aria-controls="development-password" aria-label="Show password" title="Show password"><span aria-hidden="true">${icon('eye')}</span></button></div><small id="development-password-help">Use 12–128 characters. Keep it privately; it will not be displayed again.</small></div>
    <div class="field"><label for="development-role">Role</label><select id="development-role" required><option value="engineer">Engineer</option><option value="architect">Architect</option></select></div>
    <div class="account-wide"><button class="btn btn-primary" type="submit">Create test account</button></div></form>
    <div id="development-pending"></div></section>
    <section id="edit-panel" class="card card-pad account-section" hidden><h2>Edit account access</h2><p id="edit-person" class="account-message"></p><form id="edit-form" class="account-form"><input id="edit-id" type="hidden"><div class="field"><label for="edit-role">Authorized role</label><select id="edit-role">${roleOptions()}</select></div><div class="field"><label for="edit-status">Account status</label><select id="edit-status"><option value="active">Active</option><option value="inactive">Inactive</option></select></div><div class="account-wide account-tools"><button class="btn btn-primary" type="submit">Save access</button><button class="btn btn-secondary" type="button" data-close-edit>Cancel</button></div></form></section>
    <details class="card card-pad account-section" id="recovery-panel"><summary>Advanced / Recovery Account Linking</summary><p class="account-message">For an Auth account that already exists. Verify the person and email in Supabase Authentication before linking. Existing links cannot be reassigned here.</p>
    <form id="account-form" class="account-form"><div class="field account-wide"><label for="account-profile">Company person</label><select id="account-profile" required><option value="">Choose a person</option></select></div><div class="field"><label for="account-name">Full name</label><input id="account-name" readonly required></div><div class="field"><label for="account-role">Authorized role</label><select id="account-role" required><option value="">Choose a role</option>${roleOptions()}</select></div><div class="field account-wide"><label for="account-auth-id">Supabase Auth user ID</label><input id="account-auth-id" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" placeholder="Verified Auth UUID"></div><div class="field"><label for="account-status">Account status</label><select id="account-status"><option value="inactive">Inactive</option><option value="active">Active</option></select></div><div class="account-wide"><button class="btn btn-secondary" type="submit">Link verified account</button></div></form></details>
    <details class="card card-pad account-section"><summary>Account access history</summary><p class="account-message">Recent changes, with the acting administrator and time.</p><button class="btn btn-secondary" data-audit>Load recent history</button><div id="account-audit"></div></details>`;
  const $ = selector => root.querySelector(selector);
  const peoplePanel = root.querySelector('section');
  root.insertBefore($('#invite-panel'), peoplePanel); root.insertBefore($('#development-panel'), peoplePanel); root.insertBefore($('#edit-panel'), peoplePanel);
  function message(value,error=false) { if(root.isConnected){$('#accounts-feedback').textContent=value;$('#accounts-feedback').setAttribute('role',error?'alert':'status');} }
  function updateControls(){
    root.querySelectorAll('button').forEach(button=>button.disabled=busy);
    root.querySelectorAll('[data-open-invite],[data-invite],[data-retry],[data-resend],#invite-form button[type=submit]').forEach(button=>button.disabled=busy||!capabilities?.invitations_enabled);
    $('#development-form button[type=submit]').disabled=busy||!capabilities?.development_enabled;
    root.querySelectorAll('form input,form select').forEach(input=>input.disabled=busy);
  }
  async function loadCapabilities(){
    try{
      const data=await invoke({action:'capabilities'});if(!root.isConnected)return;capabilities=data;
      $('#account-availability').textContent=data.invitations_enabled?'Production email invitations are enabled.':
        'Production email invitations are not yet configured. Send Invitation will be available when email delivery is enabled.';
      $('#development-panel').hidden=!data.development_enabled;
      $('#development-pending').innerHTML=data.pending_development_accounts?.length?`<h3>Unfinished test accounts</h3><p class="account-message">Retry the original details and password. If Auth creation already succeeded, retry finishes linking without changing that password.</p><div class="account-tools">${data.pending_development_accounts.map(job=>`<button class="btn btn-secondary" data-development-retry="${esc(job.id)}">Retry ${esc(job.name)} · ${esc(job.email)}</button>`).join('')}</div>`:'';
    }catch(_){if(!root.isConnected)return;capabilities=null;$('#development-panel').hidden=true;$('#account-availability').textContent='Account creation service is unavailable. Check Edge Function deployment and configuration, then Refresh. People and existing access can still be managed.';}
    updateControls();
  }
  function render() {
    const query=$('#people-search').value.trim().toLowerCase();
    const people=records.filter(p=>`${p.name} ${p.email||''} ${MCPAPermissions.labels[p.role]||''}`.toLowerCase().includes(query));
    $('#accounts-list').setAttribute('aria-busy','false');
    $('#accounts-list').innerHTML=people.length?`<div class="table-wrap" tabindex="0" role="region" aria-label="People and account access; scroll horizontally for all columns"><table><thead><tr><th scope="col">Person</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Account</th><th scope="col">Actions</th></tr></thead><tbody>${people.map(p=>`<tr><td>${esc(p.name)}<small class="account-reference">${esc(p.id)}</small></td><td>${esc(p.email||'Not recorded')}</td><td>${esc(MCPAPermissions.labels[p.role]||'Unconfigured')}</td><td>${p.account_status==='active'?'Active':'Inactive'}</td><td>${p.development_account?'Development / Testing Only':p.invitation_prepared?'Invitation needs completion':p.invitation_pending?'Invitation Pending':p.auth_user_id?'Linked':'Not linked'}</td><td><div class="account-row-actions">${p.invitation_prepared?`<button class="btn btn-secondary" data-retry="${esc(p.invitation_id)}">Retry invitation</button>`:`<button class="btn btn-secondary" data-edit="${esc(p.id)}">Edit access</button>`}${p.invitation_pending&&p.invitation_id&&p.account_status==='active'?`<button class="btn btn-secondary" data-resend="${esc(p.invitation_id)}">Resend invitation</button>`:''}${!p.auth_user_id&&!p.invitation_id&&p.role!=='admin'?`<button class="btn btn-secondary" data-invite="${esc(p.id)}">Invite</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`:'<p class="account-message">No people match your search.</p>';
    updateControls();
  }
  async function load(){
    const {data,error}=await client.rpc('mcpa_accounts');if(error)throw new Error('People could not load. Verify Admin access and the account-management migration, then refresh.');if(!root.isConnected)return;
    records=data||[];render();
    const options=records.filter(p=>!p.auth_user_id&&!p.invitation_id&&p.role!=='admin').map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.id)}</option>`).join('');
    for(const [selector,label] of [['#invite-person','Create a new company person'],['#account-profile','Choose a person']]){const value=$(selector).value;$(selector).innerHTML=`<option value="">${label}</option>${selector==="#account-profile"?'<option value="__new">Create a new company person</option>':''}${options}`;if([...$(selector).options].some(o=>o.value===value))$(selector).value=value;}
  }
  async function run(work,success){
    if(busy)return;busy=true;updateControls();message('Saving account changes…');
    try{const result=await work();if(!root.isConnected)return;try{await load();message(result?.message||success);}catch(_){message('The action completed, but the list could not refresh. Refresh before making another change.',true);}}
    catch(error){message(error.message,true);try{await load();}catch(_){} }
    finally{busy=false;if(root.isConnected){updateControls();await loadCapabilities();}}
  }
  async function invoke(body){const {data,error}=await client.functions.invoke('manage-accounts',{body});if(error){let detail;try{detail=await error.context?.json();}catch(_){}throw new Error(detail?.error||'Account service could not complete the request. Verify Edge Function deployment and refresh; retry the same account request.');}return data;}
  async function save(p,role,status,authId=p.auth_user_id){const {error}=await client.rpc('mcpa_save_account',{p_id:p.id,p_name:p.name,p_role:role,p_status:status,p_auth_user_id:authId||null});if(error)throw new Error(['22023','42501'].includes(error.code)?error.message:error.code==='23505'?'This Auth account is already linked to another person.':'Account changes could not be saved. Refresh and try again.');}
  function checkDuplicate(){const duplicate=!$('#invite-person').value&&records.some(p=>p.name.trim().toLowerCase()===$('#invite-name').value.trim().toLowerCase());$('#distinct-person-label').hidden=!duplicate;if(!duplicate)$('#distinct-person').checked=false;}
  function choosePerson(){const p=records.find(p=>p.id===$('#invite-person').value);$('#invite-name').value=p?.name||'';$('#invite-name').readOnly=!!p;$('#invite-role').value=roles.some(([r])=>r===p?.role)?p.role:'';$('#distinct-person').checked=false;checkDuplicate();}
  function openInvite(id=''){if(!capabilities?.invitations_enabled)return;$('#invite-panel').hidden=false;$('#invite-person').value=id;choosePerson();$('#invite-person').focus();}
  $('#invite-person').onchange=choosePerson;$('#invite-name').oninput=checkDuplicate;$('#people-search').oninput=render;
  $('#invite-form').oninput=()=>{invitationId=crypto.randomUUID();};
  $('#invite-form').onsubmit=event=>{event.preventDefault();if(!event.target.reportValidity())return;run(async()=>{const result=await invoke({action:'invite',id:invitationId,profile_id:$('#invite-person').value||null,name:$('#invite-name').value.trim(),email:$('#invite-email').value.trim(),role:$('#invite-role').value,distinct_person:$('#distinct-person').checked});event.target.reset();invitationId=crypto.randomUUID();$('#invite-panel').hidden=true;return result;});};
  function setDevelopmentPasswordVisible(visible){
    const input=$('#development-password'),button=$('#development-password-toggle');
    const selection=document.activeElement===input?[input.selectionStart,input.selectionEnd,input.selectionDirection]:null;
    input.type=visible?'text':'password';
    button.setAttribute('aria-label',visible?'Hide password':'Show password');
    button.title=visible?'Hide password':'Show password';
    button.innerHTML=`<span aria-hidden="true">${icon(visible?'eyeOff':'eye')}</span>`;
    if(selection)input.setSelectionRange(...selection);
  }
  function clearDevelopmentPassword(){$('#development-password').value='';setDevelopmentPasswordVisible(false);}
  $('#development-password-toggle').onpointerdown=event=>{
    if(event.button===0&&document.activeElement===$('#development-password'))event.preventDefault();
  };
  $('#development-password-toggle').onclick=()=>setDevelopmentPasswordVisible($('#development-password').type==='password');
  $('#development-form').onreset=()=>setDevelopmentPasswordVisible(false);
  $('#development-form').oninput=event=>{if(event.target.id!=='development-password')developmentId=crypto.randomUUID();};
  $('#development-form').onsubmit=event=>{event.preventDefault();if(!capabilities?.development_enabled||!event.target.reportValidity())return;run(async()=>{
    try{const result=await invoke({action:'createDevelopmentAccount',id:developmentId,name:$('#development-name').value.trim(),email:$('#development-email').value.trim(),password:$('#development-password').value,role:$('#development-role').value});event.target.reset();developmentId=crypto.randomUUID();return result;}
    finally{clearDevelopmentPassword();}
  });};
  $('#account-profile').onchange=()=>{const p=records.find(p=>p.id===$('#account-profile').value);$('#account-name').value=p?.name||'';$('#account-name').readOnly=!!p;$('#account-role').value=p?.role||'';};
  $('#account-form').onsubmit=event=>{event.preventDefault();if(!event.target.reportValidity())return;const p=$('#account-profile').value==='__new'?{id:null,name:$('#account-name').value.trim()}:records.find(p=>p.id===$('#account-profile').value);if(p)run(async()=>{await save(p,$('#account-role').value,$('#account-status').value,$('#account-auth-id').value.trim());event.target.reset();},'Account linked. Existing custody and history remain attached to this person.');};
  $('#edit-form').onsubmit=event=>{event.preventDefault();const p=records.find(p=>p.id===$('#edit-id').value);if(p)run(async()=>{await save(p,$('#edit-role').value,$('#edit-status').value);$('#edit-panel').hidden=true;},'Account access updated.');};
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-open-invite'))openInvite();if(button.dataset.invite)openInvite(button.dataset.invite);
    if(button.hasAttribute('data-close-invite'))$('#invite-panel').hidden=true;if(button.hasAttribute('data-close-edit'))$('#edit-panel').hidden=true;
    if(button.hasAttribute('data-refresh')){load().then(()=>message('People refreshed.')).catch(error=>message(error.message,true));loadCapabilities();}
    if(button.dataset.developmentRetry){const job=capabilities?.pending_development_accounts?.find(job=>job.id===button.dataset.developmentRetry);if(job){developmentId=job.id;$('#development-name').value=job.name;$('#development-email').value=job.email;$('#development-role').value=job.role;clearDevelopmentPassword();$('#development-password').focus();}}
    if(button.dataset.retry||button.dataset.resend)run(()=>invoke({action:button.dataset.retry?'retry':'resend',id:button.dataset.retry||button.dataset.resend}));
    if(button.dataset.edit){const p=records.find(p=>p.id===button.dataset.edit);if(!p)return;$('#edit-panel').hidden=false;$('#edit-id').value=p.id;$('#edit-person').textContent=`${p.name} · ${p.email||'No linked email'}`;$('#edit-role').innerHTML=roleOptions()+(p.role==='admin'?'<option value="admin">Admin</option>':'');$('#edit-role').value=p.role||'';$('#edit-status').value=p.account_status;$('#edit-role').focus();}
    if(button.hasAttribute('data-audit')){button.disabled=true;client.from('mcpa_account_audit').select('actor_id,profile_id,event,created_at').order('created_at',{ascending:false}).limit(100).then(({data,error})=>{if(!root.isConnected)return;if(error){$('#account-audit').textContent='History could not load. Refresh and try again.';return;}const name=id=>records.find(p=>p.id===id)?.name||id;$('#account-audit').innerHTML=data?.length?`<ol class="account-history">${data.map(row=>`<li><strong>${esc(row.event.replaceAll('_',' '))}</strong> · ${esc(name(row.profile_id))}<br><small>${esc(name(row.actor_id))} · ${esc(new Date(row.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}))} (Manila)</small></li>`).join('')}</ol>`:'<p>No account changes recorded yet.</p>';}).catch(()=>{if(root.isConnected)$('#account-audit').textContent='History could not load. Try again.';}).finally(()=>{button.disabled=false;});}
  });
  load().catch(error=>{$('#accounts-list').textContent='People are unavailable. Use Refresh to try again.';message(error.message,true);});
  updateControls();loadCapabilities();
})();
