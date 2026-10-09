const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/equipment-tracking.js'), 'utf8');
function harness(db = {}) {
  const window = new EventTarget(), document = new EventTarget();
  window.supabaseClient = db;
  const timers = new Map(), intervals = new Map(); let id = 0;
  vm.runInNewContext(source, {window, document,
    setTimeout(fn) {timers.set(++id,fn); return id;}, clearTimeout(id) {timers.delete(id);},
    setInterval(fn,ms) {intervals.set(++id,{fn,ms});return id;}, clearInterval(id) {intervals.delete(id);}});
  return {api:window.EquipmentTracking, window, document, timers, intervals, async flush() {const list=[...timers.values()];timers.clear();for(const fn of list)await fn();}};
}
test('availability follows project assignment and raw/normalized statuses', () => {
  const {api} = harness();
  for (const status of ['IN_USE','inuse','In Use']) assert.equal(api.availability({site_id:'project',status}), 'Deployed');
  assert.equal(api.availability({site_id:null,status:'IN_USE'}), 'Available');
  assert.equal(api.availability({site_id:'project',status:'IN_OFFICE'}), 'Available');
  assert.equal(api.availability({site_id:'project',status:'AVAILABLE'}), 'Unavailable');
  assert.equal(api.availability({site_id:'project',status:'REPAIR'}), 'Unavailable');
  assert.equal(api.availability({site_id:null,site:'Unassigned',status:'MISSING'}), 'Available');
  assert.equal(api.availability({siteId:null,site:'Unassigned',status:'IN_USE'}), 'Available');
  assert.equal(api.matchesStatus({site_id:'p',status:'AVAILABLE'}, 'Available'), false);
  assert.equal(api.matchesStatus({site_id:'p',status:'IN_OFFICE'}, 'Available'), true);
  assert.equal(api.matchesStatus({site_id:'p',status:'REPAIR'}, 'For Repair'), true);
});
test('tallies sum quantities, count zero as zero, and do not trust manual AVAILABLE', () => {
  const {api} = harness();
  const result = api.tally([{quantity:4,site_id:null,status:'IN_OFFICE'}, {qty:7,siteId:'p',status:'inuse'}, {quantity:0,site_id:null}, {quantity:2,site_id:'p',status:'AVAILABLE'}]);
  assert.equal(result.total,13); assert.equal(result.available,4); assert.equal(result.deployed,7);
});
test('paged reads respect the actual response cap and active-project query', async () => {
  const filters=[];
  const {api}=harness({from(table) {
    let start=0, filter;
    const rows=table==='equipment' ? [{id:'1',asset_id:'DRILL',site_id:'a',quantity:2,status:'IN_USE',image_url:'/drill.png'}, {id:'2',asset_id:'ZERO',site_id:'a',quantity:0}] : table==='sites' ? [{id:'a',name:'Active',is_active:true},{id:'b',name:'Archived',is_active:false}] : [];
    return {select(){return this;},order(){return this;},eq(key,value){filter=[key,value];filters.push([table,key,value]);return this;},range(offset){start=offset;return this;},then(resolve){const visible=filter?rows.filter(r=>r[filter[0]]===filter[1]):rows;return Promise.resolve({data:visible.slice(start,start+1),count:visible.length}).then(resolve);}};
  }});
  const data=await api.snapshot();
  assert.equal(data.tools.length,2);assert.equal(data.activeProjects.length,1);
  assert.equal(data.tools[0].image_url,'/drill.png');assert.equal(data.tools[0].site,'Active');
  assert.deepEqual(filters,[['sites','is_active',true]]);
});
test('realtime watches both tables, coalesces bursts, and removes its channel on disposal', async () => {
  const listeners=[]; let subscribed, removed=0, reads=0;
  const channel={on(type,filter,fn){listeners.push({type,filter,fn});return this;},subscribe(fn){subscribed=fn;return this;}};
  const h=harness({channel(){return channel;},removeChannel(value){assert.equal(value,channel);removed++;}});
  const stop=h.api.watch(async()=>{reads++;});
  assert.deepEqual(listeners.map(l=>l.filter.table),['equipment','sites']);
  listeners[0].fn();listeners[1].fn();await h.flush();assert.equal(reads,1);
  subscribed('SUBSCRIBED');await h.flush();assert.equal(reads,2);
  stop();listeners[0].fn();await h.flush();assert.equal(reads,2);assert.equal(removed,1);
});
test('changes arriving during an in-flight reload trigger a follow-up read', async () => {
  let change, release, reads=0;
  const channel={on(type,filter,fn){change=fn;return this;},subscribe(){return this;}};
  const h=harness({channel(){return channel;},removeChannel(){}});
  const stop=h.api.watch(()=>{reads++;return reads===1?new Promise(r=>{release=r;}):Promise.resolve();});
  change();const first=h.flush();change();await h.flush();release();await first;await h.flush();
  assert.equal(reads,2);stop();
});

test('30-second fallback pauses when hidden, retries on return/online, and clears errors after recovery', async()=>{
  const h=harness();let offline=true,reads=0;const statuses=[];
  const stop=h.api.watch(async()=>{reads++;if(offline)throw new Error('Offline fixture');},message=>statuses.push(message));
  assert.equal([...h.intervals.values()][0].ms,30000);
  [...h.intervals.values()][0].fn();await h.flush();assert.equal(reads,1);assert.match(statuses.at(-1),/Unable to sync/);
  h.document.hidden=true;[...h.intervals.values()][0].fn();h.window.dispatchEvent(new Event('focus'));await h.flush();assert.equal(reads,1);
  h.document.hidden=false;offline=false;h.document.dispatchEvent(new Event('visibilitychange'));h.window.dispatchEvent(new Event('online'));await h.flush();assert.equal(reads,2);assert.equal(statuses.at(-1),'');
  stop();assert.equal(h.intervals.size,0);h.window.dispatchEvent(new Event('online'));await h.flush();assert.equal(reads,2);
});

test('account watcher subscribes only to its readable audit table and deduplicates table names',()=>{
  const tables=[];const channel={on(_event,filter){tables.push(filter.table);return this;},subscribe(){return this;}};
  const h=harness({channel(){return channel;},removeChannel(){}});
  const stop=h.api.watch(async()=>{},()=>{},{tables:['mcpa_account_audit','mcpa_account_audit']});
  assert.deepEqual(tables,['mcpa_account_audit']);stop();
});
