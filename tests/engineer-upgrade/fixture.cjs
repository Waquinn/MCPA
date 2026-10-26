const fs=require('node:fs'),path=require('node:path');
const {fixture:base,randomUUID}=require('../integration-quantity-custody-v2/fixture.cjs');
async function upgrade(f){
 for(const name of ['202610280001_engineer_request_permissions.sql','202610280002_secure_invitation_registration.sql'])
  await f.db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations',name),'utf8'));
 return f;
}
async function fixture(t){return upgrade(await base(t));}
module.exports={fixture,upgrade,randomUUID};
