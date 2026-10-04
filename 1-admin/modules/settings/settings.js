(function () {
  const root=document.getElementById('screen-settings'),user=MCPAAuth.profile;
  if(!root||!user)return;
  const esc=MovementOverview.escape;
  root.innerHTML=`<div class="page-head"><div><h1 class="display">My account</h1><p class="sub">Your authorized identity and display preferences</p></div></div><section class="card card-pad"><h2>${esc(user.name)}</h2><p class="account-message">${esc(MCPAPermissions.labels[user.role])} · ${MCPAAuth.isDemo?'Offline demonstration':'Active company account'}</p><p class="account-message">Account roles are managed by an administrator. To reset your password, sign out and choose Forgot password on the login screen.</p><div class="account-tools"><button class="btn btn-secondary" id="account-theme">Change light / night mode</button><button class="btn btn-secondary" id="account-logout">${MCPAAuth.isDemo?'Exit demo':'Log Out'}</button></div></section>`;
  root.querySelector('#account-theme').onclick=toggleTheme;
  root.querySelector('#account-logout').onclick=()=>MCPAAuth.logout();
})();
