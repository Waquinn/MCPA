import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {once} from 'node:events';
import {publicConfiguration} from '../scripts/configure-supabase.mjs';
import {createDevServer} from '../scripts/dev-server.mjs';

const url = 'https://newproject.supabase.co';
const env = {SUPABASE_URL:url, SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test', SUPABASE_SECRET_KEY:'sb_secret_never_export'};
const jwt = payload => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signature';
const source = await readFile(new URL('../js/supabase-client.js', import.meta.url), 'utf8');
const moduleSources = Object.fromEntries(await Promise.all(['equipment-tracking.js','movement-cloud.js'].map(async file => [file, await readFile(new URL('../js/' + file, import.meta.url), 'utf8')])));

test('public configuration exports only the new URL and public key', () => {
  assert.deepEqual(publicConfiguration(env), {supabaseUrl:url, supabasePublishableKey:'sb_publishable_test'});
  assert.ok(!JSON.stringify(publicConfiguration(env)).includes(env.SUPABASE_SECRET_KEY));
});

test('configuration rejects missing keys, server keys, wrong-project anon keys and invalid origins', () => {
  for (const key of ['', 'sb_secret_private', jwt({role:'service_role'}), jwt({role:'authenticated'})]) {
    assert.throws(() => publicConfiguration({...env,SUPABASE_PUBLISHABLE_KEY:key}), /publishable key/);
  }
  assert.throws(() => publicConfiguration({...env,SUPABASE_PUBLISHABLE_KEY:jwt({role:'anon',ref:'oldproject'})}), /different/);
  for (const value of ['http://remote.example','https://user:pass@example.com','https://example.com/path','https://example.com?key=private','https://example.com#private']) {
    assert.throws(() => publicConfiguration({...env,SUPABASE_URL:value}), /origin/);
  }
  assert.equal(publicConfiguration({...env,SUPABASE_URL:'http://127.0.0.1:54321'}).supabaseUrl, 'http://127.0.0.1:54321');
  assert.equal(publicConfiguration({SUPABASE_URL:url,SUPABASE_ANON_KEY:jwt({role:'anon',ref:'newproject'})}).supabaseUrl, url);
});

test('browser initializes once with the new project, and modules share the client', () => {
  const calls = [], db = {};
  const window = {MCPA_CONFIG:publicConfiguration(env), supabase:{createClient(...args) { calls.push(args); return db; }}};
  const context = vm.createContext({window,atob});
  vm.runInContext(source, context);
  assert.equal(calls.length, 0);
  assert.equal(window.MCPADatabase.client(), db);
  assert.equal(window.MCPADatabase.client(), db);
  assert.deepEqual(calls, [[url, env.SUPABASE_PUBLISHABLE_KEY]]);
  for (const file of ['equipment-tracking.js','movement-cloud.js']) vm.runInContext(moduleSources[file], context);
  assert.equal(window.EquipmentTracking.client(), db);
  assert.equal(calls.length, 1);
});

test('browser rejects missing configuration and server keys and supports legacy anon keys', () => {
  for (const key of [null,'sb_secret_private',jwt({role:'service_role'})]) {
    let calls = 0;
    const window = {MCPA_CONFIG:key ? {supabaseUrl:url,supabasePublishableKey:key} : undefined, supabase:{createClient() { calls++; }}};
    vm.runInNewContext(source, {window,atob});
    assert.throws(() => window.MCPADatabase.client(), /configuration|publishable/);
    assert.equal(calls, 0);
  }
  const window = {MCPA_CONFIG:{supabaseUrl:url,supabasePublishableKey:jwt({role:'anon'})},supabase:{createClient:() => 'anon-client'}};
  vm.runInNewContext(source, {window,atob});
  assert.equal(window.MCPADatabase.client(), 'anon-client');
});

test('local server serves both portals and blocks private configuration and scripts', async t => {
  const server = createDevServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const pathname of ['/', '/2-engr/', '/js/supabase-client.js','/1-admin/modules/masterlist/masterlist.js']) {
    assert.equal((await fetch(base + pathname)).status, 200, pathname);
  }
  for (const pathname of ['/.env','/.env.example','/.git/config','/scripts/package.json','/scripts/configure-supabase.mjs','/supabase/config.toml','/1-admin/modules/sites/tests/package.json','/js/%2e%2e%5c.env']) {
    assert.equal((await fetch(base + pathname)).status, 404, pathname);
  }
});
