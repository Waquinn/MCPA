import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createHandler } from './handler.mjs';
import { readConfiguration } from './runtime.mjs';

// Configured only in Edge Function secrets, never frontend assets.
const config=readConfiguration((name:string)=>Deno.env.get(name));
const admin = createClient(config.url, config.serverKey, {
  auth: {persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
});
Deno.serve(createHandler({
  admin, appUrl:config.appUrl,
  invitationsEnabled:Deno.env.get('MCPA_EMAIL_INVITATIONS_ENABLED') === 'true',
  invitationLinksEnabled:Deno.env.get('MCPA_INVITATION_LINKS_ENABLED') === 'true',
  developmentEnabled:config.developmentEnabled,
  developmentOrigins:config.developmentOrigins,
}));
