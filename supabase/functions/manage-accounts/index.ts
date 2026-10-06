import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createHandler } from './handler.mjs';

// Configured only in Edge Function secrets, never frontend assets.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('MCPA_SUPABASE_SECRET_KEY')!, {
  auth: {persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
});
Deno.serve(createHandler({
  admin, appUrl:Deno.env.get('MCPA_APP_URL')!,
  invitationsEnabled:Deno.env.get('MCPA_EMAIL_INVITATIONS_ENABLED') === 'true',
  developmentEnabled:Deno.env.get('MCPA_ENABLE_DEVELOPMENT_ACCOUNTS') === 'true',
  developmentOrigins:(Deno.env.get('MCPA_DEV_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean),
}));
