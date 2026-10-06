// Runtime-independent handler, exercised with Node tests. Never returns Auth tokens or links.
const roles = ['engineer', 'architect', 'secretary', 'tool_handler'];
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function createHandler({ admin, appUrl, invitationsEnabled = false, developmentEnabled = false, developmentOrigins = [] }) {
  const redirect = new URL(appUrl);
  if (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname))) throw new Error('MCPA_APP_URL must be an HTTPS login URL.');
  redirect.search = '?account_setup=invite'; redirect.hash = '';
  const origin = redirect.origin;
  const origins = new Set([origin]);
  if (developmentEnabled) for (const value of developmentOrigins) {
    const local = new URL(value);
    if (!['http:','https:'].includes(local.protocol) || !['localhost','127.0.0.1','[::1]'].includes(local.hostname) || local.origin !== value) throw new Error('Development origins must be exact loopback origins.');
    origins.add(local.origin);
  }
  return async request => {
    const requestOrigin = request.headers.get('origin');
    const headers = { 'Access-Control-Allow-Origin': origins.has(requestOrigin) ? requestOrigin : origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Cache-Control': 'no-store' };
    const reply = (body, status = 200) => Response.json(body, {status, headers});
    if (requestOrigin && !origins.has(requestOrigin)) return reply({error:'This application origin is not allowed.'}, 403);
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (request.method !== 'POST') return reply({error:'Use POST.'}, 405);
    try {
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) throw new RequestError('Sign in with an active Admin account.', 401);
      const {data:identity, error:authError} = await admin.auth.getUser(token);
      if (authError || !identity?.user) throw new RequestError('Your session could not be verified. Sign in again.', 401);
      const {data:actor, error:profileError} = await admin.from('profiles').select('id,role,account_status').eq('auth_user_id', identity.user.id).maybeSingle();
      if (profileError || actor?.role !== 'admin' || actor.account_status !== 'active') throw new RequestError('Active Admin access required.', 403);
      const text = await request.text();
      if (text.length > 4096) throw new RequestError('Request is too large.');
      let input;
      try { input = JSON.parse(text); } catch (_) { throw new RequestError('Send a valid JSON request.'); }
      if (!input || !['capabilities','createDevelopmentAccount','invite','resend','retry'].includes(input.action)
        || (input.action !== 'capabilities' && !uuid(input.id))) throw new RequestError('Choose a valid account action and request ID.');
      const step = async (action, payload, rpc = 'mcpa_invitation_step') => {
        const {data, error} = await admin.rpc(rpc, {p_actor:identity.user.id, p_action:action, p_payload:payload});
        if (error) {
          if (['22023','42501','40001'].includes(error.code)) throw new RequestError(error.message, error.code === '42501' ? 403 : 409);
          if (error.code === '23505') throw new RequestError('This person or email already has an invitation or account link. Refresh the people list.', 409);
          throw new RequestError('Account storage could not complete the request. Verify the account-management migration and retry.', 503);
        }
        return data;
      };
      const devStep = (action, payload) => step(action, payload, 'mcpa_development_account_step');
      if (input.action === 'capabilities') return reply({
        invitations_enabled: invitationsEnabled, development_enabled: developmentEnabled,
        pending_development_accounts: developmentEnabled ? await devStep('list', {}) : [],
      });
      if (input.action === 'createDevelopmentAccount') {
        if (!developmentEnabled) throw new RequestError('Development account creation is disabled.', 403);
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120
          || typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())
          || !['engineer','architect'].includes(input.role) || typeof input.password !== 'string'
          || input.password.length < 12 || input.password.length > 128 || !input.password.trim()
          || input.profile_id != null) throw new RequestError('Enter a new test name, email, a 12–128 character password, and Engineer or Architect role.');
        const job = await devStep('prepare', {id:input.id, name:input.name.trim(), email:input.email.trim().toLowerCase(), role:input.role});
        if (job.state === 'created') return reply({ok:true, profile_id:job.profile_id, message:'This test account already exists. Its password and access were not changed.'});
        const claim = await devStep('claim', {id:job.id});
        if (claim.state === 'created') return reply({ok:true, profile_id:claim.profile_id, message:'This test account already exists. Its password and access were not changed.'});
        try {
          let authId = claim.auth_user_id;
          if (!authId) {
            // Never update an existing user's password or trust browser metadata.
            const {data, error} = await admin.auth.admin.createUser({
              email:claim.email, password:input.password, email_confirm:true,
              app_metadata:{mcpa_development_account:true, mcpa_development_job_id:claim.id},
            });
            if (error || !data?.user?.id) throw new RequestError(error?.status === 429
              ? 'Account creation is rate limited. Wait and retry the same test account.'
              : 'Auth could not create the test account. Check password requirements and Auth logs, then retry the same request.', 503);
            authId = data.user.id;
          }
          const result = await devStep('finish', {id:claim.id, lease_id:claim.lease_id, auth_user_id:authId});
          return reply({ok:true, profile_id:result.profile_id, message:claim.auth_user_id
            ? 'Test account linked. Sign in with the password from the original creation attempt.'
            : 'Test account created. Sign in with its email and temporary password. No email was sent.'});
        } catch (error) {
          try { await devStep('release', {id:claim.id, lease_id:claim.lease_id}); } catch (_) { /* Retry after the lease expires. */ }
          throw error;
        }
      }
      if (!invitationsEnabled) throw new RequestError('Production email invitations are not configured. Use Development / Testing Only for test accounts.', 409);
      let job;
      if (input.action === 'invite') {
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120 || typeof input.email !== 'string'
          || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || !roles.includes(input.role)
          || (input.profile_id != null && !uuid(input.profile_id)) || (input.distinct_person != null && typeof input.distinct_person !== 'boolean')) throw new RequestError('Enter a valid full name, email, existing profile and supported role.');
        job = await step('prepare', {id:input.id, name:input.name.trim(), email:input.email.trim().toLowerCase(), role:input.role, profile_id:input.profile_id || null, distinct_person:input.distinct_person === true});
        if (job.state === 'sent') return reply({ok:true, profile_id:job.profile_id, message:'This invitation was already sent. Refresh to see its current status.'});
      }
      const claim = await step('claim', {id:job?.id || input.id});
      let authId = claim.auth_user_id;
      try {
        // A retry after an accepted email but interrupted linking must finish the
        // existing job; inviteUserByEmail rejects already-confirmed accounts.
        if (!claim.confirmed) {
          const {data, error} = await admin.auth.admin.inviteUserByEmail(claim.email, {redirectTo:redirect.href, data:{mcpa_invitation_id:claim.id}});
          if (error || !data?.user) throw new RequestError(error?.status === 429 ? 'Email is rate limited. Wait before retrying this invitation.' : 'The invitation email could not be sent. Check Supabase email/SMTP settings, then retry this person’s invitation.', 503);
          authId = data.user.id;
        }
        const result = await step('finish', {id:claim.id, lease_id:claim.lease_id, auth_user_id:authId});
        return reply({ok:true, profile_id:result.profile_id, message:claim.confirmed ? 'The existing invitation account has been linked.' : 'Invitation sent. The recipient can use the email link to set their password.'});
      } catch (error) {
        // An email may already have been sent. Keep the durable job/profile so
        // a retry can reconcile it without creating a second company identity.
        try { await step('release', {id:claim.id, lease_id:claim.lease_id}); } catch (_) { /* Lease expires after two minutes. */ }
        throw error;
      }
    } catch (error) {
      return reply({error:error instanceof RequestError ? error.message : 'Account service is unavailable. Refresh and retry the existing invitation.'}, error instanceof RequestError ? error.status : 500);
    }
  };
}
