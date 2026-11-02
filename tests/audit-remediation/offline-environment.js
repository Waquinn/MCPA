/* Test-only source replacement. This file is never referenced by application HTML. */
(function(){
  if(location.protocol!=='http:'||location.hostname!=='127.0.0.1'||!location.port)throw Error('Offline adapter requires an ephemeral loopback origin.');
  const config=()=>{const c=window.MCPA_SUPABASE_CONFIG;if(c?.url!==location.origin||c?.anonKey!=='local-fixture-only')throw Error('Invalid offline transport.');return c;};
  window.MCPAEnvironment=Object.freeze({configuration:config,installSDK(){config();},client(){config();return window.supabaseClient||(window.supabaseClient=window.supabase.createClient());}});
})();
