// Read-only checks. Never print keys, sessions, database rows or raw API errors.
import {readConfiguration, publicConfiguration} from './configure-supabase.mjs';

try {
  const env = await readConfiguration();
  const config = publicConfiguration(env);
  console.log(`Checking ${config.supabaseUrl} (read only)`);
  const response = await fetch(config.supabaseUrl + '/auth/v1/settings', {
    headers: {apikey: config.supabasePublishableKey}, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Publishable key/Auth check failed (HTTP ${response.status}). Confirm the URL and key belong to the same project.`);
  console.log('PASS: publishable key accepted by Auth.');
  const key = env.SUPABASE_SECRET_KEY;
  if (!key) { console.log('Schema check skipped: no private SUPABASE_SECRET_KEY configured.'); process.exitCode = 1; }
  else {
    const headers = {apikey: key, Accept: 'application/openapi+json'};
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    const schemaResponse = await fetch(config.supabaseUrl + '/rest/v1/', {headers, signal: AbortSignal.timeout(15000)});
    if (!schemaResponse.ok) throw new Error(`Schema inspection failed (HTTP ${schemaResponse.status}). Check the private server key.`);
    const schema = await schemaResponse.json();
    const tables = ['profiles','equipment','sites','consumables','consumable_requests','consumable_stock_movements'];
    const functions = ['mcpa_my_profile','mcpa_movement_snapshot','mcpa_movement_action','mcpa_inventory_office','mcpa_project_snapshot'];
    const missing = [...tables.map(name => '/' + name), ...functions.map(name => '/rpc/' + name)].filter(name => !schema.paths?.[name]);
    if (missing.length) { console.log('Missing API objects: ' + missing.join(', ')); process.exitCode = 1; }
    else console.log('PASS: core application tables and RPCs are present in the Data API.');
    console.log('Account login, row access and individual feature migrations still require signed-in verification.');
  }
} catch (error) {
  console.error(error instanceof TypeError ? 'Connection failed. Check network access and SUPABASE_URL.' : error.message);
  process.exitCode = 1;
}
