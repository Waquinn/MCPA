(function () {
  'use strict';
  window.MCPAModules.settings = { async init(context) {
    const root = document.getElementById('screen-settings');
    const $ = selector => root.querySelector(selector);
    const escape = MCPA.escapeHTML;
    let saving = false;
    function feedback(message, error = false) {
      if (!context.isCurrent()) return;
      const element = $('#settings-feedback');
      element.textContent = message; element.classList.toggle('hidden', !message);
      element.classList.toggle('is-error', error); element.setAttribute('role', error ? 'alert' : 'status');
    }
    $('#settings-start').innerHTML = NAV.filter(item => item.id && !['settings','users'].includes(item.id)).map(item => `<option value="${escape(item.id)}">${escape(item.label)}</option>`).join('');
    function fillPreferences() {
      const values = MCPA.getPreferences();
      $('#settings-theme').value = values.theme;
      $('#settings-page-size').value = values.pageSize;
      $('#settings-start').value = values.defaultScreen;
    }
    fillPreferences();
    window.addEventListener('mcpa:preferences', fillPreferences, { signal: context.signal });
    $('#settings-preferences').onsubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      if (!['light','dark'].includes(values.theme) || ![10,25,50].includes(Number(values.pageSize)) || !NAV.some(item => item.id === values.defaultScreen && !['settings','users'].includes(item.id))) return feedback('Choose a valid value for each preference.', true);
      try { MCPA.savePreferences(values); feedback('Preferences saved.'); }
      catch (_) { feedback('Your browser could not save preferences. Enable local storage and try again.', true); }
    };
    $('#settings-reset').onclick = () => {
      try { MCPA.savePreferences({theme:'light', pageSize:10, defaultScreen:'dashboard'}); feedback('Default preferences restored.'); }
      catch (_) { feedback('Your browser could not save preferences. Enable local storage and try again.', true); }
    };
    const user = MCPA.session?.user;
    if (!user) {
      $('#settings-profile').innerHTML = '<p>You are using the public prototype workspace. Sign in with an existing account to view or update your profile.</p><button type="button" class="btn btn-secondary" style="margin-top:16px" id="settings-sign-in">Go to Sign In</button>';
      $('#settings-sign-in').onclick = logoutApp;
      return;
    }
    try {
      const { data, error } = await MCPA.getClient().from('profiles').select('id,name,role').eq('id', user.id);
      if (error) throw error;
      if (!context.isCurrent()) return;
      const profile = data?.[0];
      if (!profile) {
        $('#settings-profile').textContent = 'Your profile is not available. Ask your administrator to check your account.';
        return;
      }
      $('#settings-profile').innerHTML = `<form id="settings-profile-form"><div class="field"><label for="settings-name">Full name</label><input id="settings-name" name="name" maxlength="120" required value="${escape(profile.name)}"></div><div class="field"><label for="settings-role">Role</label><input id="settings-role" readonly value="${escape(profile.role || 'Not assigned')}"></div><div class="field"><label for="settings-email">Account email</label><input id="settings-email" type="email" readonly value="${escape(user.email)}"></div><button class="btn btn-primary" type="submit">Save Profile</button></form>`;
      $('#settings-profile-form').onsubmit = async event => {
        event.preventDefault();
        if (saving) return;
        const name = $('#settings-name').value.trim().replace(/\s+/g, ' ');
        if (!name || name.length > 120) return feedback('Enter a name between 1 and 120 characters.', true);
        const button = event.target.querySelector('button');
        saving = true; button.disabled = true;
        try {
          const { data: saved, error: saveError } = await MCPA.getClient().rpc('settings_update_profile', { p_name: name });
          if (saveError) throw saveError;
          if (!saved) throw new Error('No profile was updated');
          if (!context.isCurrent()) return;
          MCPA.profile = { ...profile, name };
          updateAccountDisplay();
          feedback('Profile saved.');
        } catch (saveError) { console.error('Profile update failed', saveError?.code); feedback(MCPA.errorMessage(saveError, 'Your profile could not be saved. Try again.'), true); }
        finally { saving = false; if (context.isCurrent()) button.disabled = false; }
      };
    } catch (error) {
      if (!context.isCurrent()) return;
      $('#settings-profile').innerHTML = '<p>Unable to load your profile.</p><button type="button" class="btn btn-secondary" id="settings-retry">Try Again</button>';
      $('#settings-retry').onclick = () => { destroyModule(); showScreen('settings'); };
      feedback(MCPA.errorMessage(error), true);
    }
  } };
})();
