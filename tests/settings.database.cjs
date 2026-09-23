const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite}=require('../modules/sites/tests/node_modules/@electric-sql/pglite');
(async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated;
      create table public.profiles(id uuid primary key,name text,role text);
      insert into public.profiles values ('11111111-1111-4111-8111-111111111111','Original','admin'),('22222222-2222-4222-8222-222222222222','Other','engineer');`);
    const setup=fs.readFileSync(path.join(__dirname,'../modules/settings/setup.sql'),'utf8');
    await db.exec(setup);await db.exec(setup);
    await db.exec('set role anon');
    await assert.rejects(()=>db.query("select public.settings_update_profile('Denied')"),e=>e.code==='42501');
    await db.exec('reset role;set role authenticated');
    await assert.rejects(()=>db.query("select public.settings_update_profile('Denied')"),e=>e.code==='42501');
    await db.exec("set test.uid='11111111-1111-4111-8111-111111111111'");
    await assert.rejects(()=>db.query("select public.settings_update_profile('   ')"),e=>e.code==='23514');
    await db.query("select public.settings_update_profile('  Updated   Name  ')");
    await db.exec('reset role');
    const rows=(await db.query('select * from profiles order by id')).rows;
    assert.deepEqual(rows.map(r=>[r.name,r.role]),[['Updated Name','admin'],['Other','engineer']]);
    console.log('PASS Settings SQL: repeatable setup, authenticated self-update, validation, role and other-profile preservation');
  } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
