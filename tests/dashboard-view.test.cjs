const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(){
  const context=vm.createContext({window:{},icon:()=>'<svg></svg>'});
  for(const file of ['equipment-tracking.js','dashboard-view.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),context);
    context.EquipmentTracking=context.window.EquipmentTracking;
  }
  const data={tools:[
    {id:'A',name:'Drill',qty:3,status:'inuse',site:'Site One',holder:'Engineer'},
    {id:'B',name:'Grinder',qty:2,status:'inoffice',site:'Unassigned',holder:''},
    {id:'C',name:'Saw',qty:1,status:'underrepair',site:'Site One',holder:'Engineer'},
    {id:'D',name:'Hidden zero',qty:0,status:'available'},
  ],sites:[{id:'s1',name:'Site One',is_active:true},{id:'s2',name:'Archived site',is_active:false}],activity:[],requests:[],transfers:[],repairs:[],missing:[]};
  const state={query:'',status:'',site:'',condition:''};
  const view=context.window.DashboardView;
  const render=(user={role:'admin'},input=data)=>view.render(input,user,state,()=>'',tools=>tools.map(t=>t.id).join(','),date=>date);
  return {data,state,view,render,context};
}
test('dashboard preserves quantity tallies and Engineer custody scope; no invented activity',()=>{
  const {render}=setup();
  const html=render();
  assert.match(html,/<span class="num">6<\/span>/);
  assert.match(html,/No equipment movements recorded in this period/);
  assert.doesNotMatch(html,/Hidden zero/);
  assert.doesNotMatch(html.split('command-panel dashboard-projects')[1],/Archived site/);
  assert.match(render({role:'engineer',name:'Engineer'}),/<span class="num">4<\/span>/);
  assert.match(render({role:'engineer',name:''}),/<span class="num">0<\/span>/);
});
test('dashboard combines search, project, status and condition filters without changing the snapshot',()=>{
  const {data,state,view}=setup(), before=JSON.stringify(data);
  const read=()=>view.inventory(data,{role:'admin'},state,rows=>rows.map(t=>t.id).join(','));
  state.status='repair'; assert.ok(read().startsWith('C<'));
  state.site='Unassigned'; assert.match(read(),/No matching equipment/);
  state.status='available';state.site='__unassigned';state.condition='available';assert.ok(read().startsWith('B<'));
  state.query='Drill';assert.match(read(),/No matching equipment/);
  assert.equal(JSON.stringify(data),before);
});
test('live and demo audit names populate the same seven-day chart and exclude old events',()=>{
  const {data,render}=setup();
  data.activity=['createRequest','releaseRequest','createTransfer','receiveTransfer','createReturn','request_created','transfer_created','transfer_received','return_created'].map((action,i)=>({id:String(i),action,createdAt:new Date().toISOString(),summary:'Saved event',actor:'Engineer'}));
  data.activity.push({action:'createRequest',createdAt:'2000-01-01T00:00:00Z',summary:'Old event',actor:'Engineer'});
  const html=render();
  assert.match(html,/<title>Requests: 2/);
  assert.match(html,/<title>Releases: 3/);
  assert.match(html,/<title>Receipts: 2/);
  assert.match(html,/<title>Returns: 2/);
  assert.doesNotMatch(html,/No equipment movements recorded in this period/);
});
test('untrusted project and activity text is escaped',()=>{
  const {data,render}=setup();
  data.sites[0].name='<img src=x onerror=alert(1)>';
  data.activity=[{action:'createRequest',createdAt:new Date().toISOString(),actor:'<script>',summary:'<svg onload=alert(1)>'}];
  const html=render();
  assert.doesNotMatch(html,/<img src=x|<script>|<svg onload/);
  assert.match(html,/&lt;img/);
});


test('live dashboard custody and incoming transfers distinguish duplicate display names',()=>{
  const {data,state,view,render,context}=setup();
  context.window.MCPAAuth={isDemo:false};
  data.tools[0].holderId='person-a';data.tools[2].holderId='person-b';
  data.transfers=[{id:'TRF-OTHER',status:'pending',receiver:'Engineer',receiverId:'person-b',toolIds:['C']}];
  const html=render({id:'person-a',name:'Engineer',role:'engineer'});
  assert.match(html,/<span class="num">3<\/span>/);
  const inventory=view.inventory(data,{id:'person-a',name:'Engineer',role:'engineer'},state,rows=>rows.map(t=>t.id).join(','));
  assert.ok(inventory.startsWith('A<'));
});
