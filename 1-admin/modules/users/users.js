(function () {
  'use strict';
  const root=document.getElementById('screen-users');
  if(!root || !MCPAAuth.canRoute('users') || MCPAAuth.isDemo)return;
  const esc=MovementOverview.escape, client=EquipmentTracking.client();let records=[],saving=false;
  root.innerHTML='<div class="page-head"><div><h1 class="display">People & Accountability</h1><p class="sub">Link company profiles to authenticated accounts. Historical custody records are retained.</p></div></div><div class="card card-pad"><p class="account-message">Create or invite a user in Supabase Authentication first, then link their Auth user ID here. Invitations and passwords are handled by Supabase; this page never stores passwords.</p><div id="accounts-feedback" role="status"></div><div id="accounts-list"></div><form id="account-form" class="account-form"><div class="field account-wide"><label for="account-profile">Existing profile</label><select id="account-profile"><option value="">New company profile</option></select></div><div class="field"><label for="account-name">Full name</label><input id="account-name" required maxlength="120"></div><div class="field"><label for="account-role">Authorized role</label><select id="account-role" required><option value="">Choose a role</option>'+Object.entries(MCPAPermissions.labels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')+'</select></div><div class="field"><label for="account-auth-id">Supabase Auth user ID</label><input id="account-auth-id" placeholder="UUID from Authentication → Users" pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"></div><div class="field"><label for="account-status">Account status</label><select id="account-status"><option value="inactive">Inactive</option><option value="active">Active</option></select></div><div class="account-wide"><button class="btn btn-primary" type="submit">Save account access</button></div></form></div>';
  const $=selector=>root.querySelector(selector);
  function message(text){$('#accounts-feedback').textContent=text;}
  async function load(){
    const {data,error}=await client.rpc('mcpa_accounts');if(!root.isConnected)return;
    if(error){message('Account records could not load. Verify your Admin access and database setup.');return;}
    records=data||[];
    $('#account-profile').innerHTML='<option value="">New company profile</option>'+records.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    $('#accounts-list').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Account link</th></tr></thead><tbody>${records.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(MCPAPermissions.labels[p.role]||'Unconfigured')}</td><td>${esc(p.account_status)}</td><td>${p.auth_user_id?'Linked':'Not linked'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  $('#account-profile').onchange=()=>{
    const p=records.find(p=>p.id===$('#account-profile').value);
    $('#account-name').value=p?.name||'';$('#account-role').value=p?.role||'';$('#account-auth-id').value=p?.auth_user_id||'';$('#account-status').value=p?.account_status||'inactive';
  };
  $('#account-form').onsubmit=async event=>{
    event.preventDefault();if(saving||!event.target.reportValidity())return;
    if($('#account-status').value==='active'&&!$('#account-auth-id').value){message('Link a Supabase Auth account before activation.');return;}
    saving=true;const button=event.target.querySelector('button');button.disabled=true;
    try{
      const {error}=await client.rpc('mcpa_save_account',{p_id:$('#account-profile').value||null,p_name:$('#account-name').value.trim(),p_role:$('#account-role').value,p_status:$('#account-status').value,p_auth_user_id:$('#account-auth-id').value.trim()||null});
      if(error)throw error;
      event.target.reset();await load();message('Account access saved. Existing movement and custody history is unchanged.');
    }catch(error){message(['22023','42501'].includes(error.code)?error.message:error.code==='23505'?'This Auth account is already linked to a profile.':'Account access could not be saved. Check your connection and the Auth user ID.');}
    finally{saving=false;button.disabled=false;}
  };
  load().catch(()=>message('Account service is unavailable. Refresh and try again.'));
})();
