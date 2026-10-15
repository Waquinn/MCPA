const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,go,login,logout,shot})=>{
  const q=JSON.stringify;
  await f.db.exec("alter type equipment_status add value if not exists 'IN_OFFICE'");
  const cases=[
    ['T-8861','Pala','AVAILABLE',null,f.sites.main,'Good',1,'available'],
    ['T-8862','Welding Machine','AVAILABLE',null,null,'Good',1,'available'],
    ['T-RESERVED','Reserved drill','AVAILABLE',null,f.sites.main,'Good',1,'reserved'],
    ['T-HANDOVER','Pending handover','AVAILABLE',null,f.sites.main,'Good',1,'transfer'],
    ['T-ASSIGNED','Recorded available but held','AVAILABLE',f.actors.sky.id,f.sites.casa,'Good',1,'assigned'],
    ['T-MISSING','Missing stock','MISSING',null,null,'Good',1,'missing'],
    ['T-DAMAGED','Damaged stock','AVAILABLE',null,null,'Damaged',1,'damaged'],
    ['T-INUSE','Assigned tool','IN_USE',f.actors.sky.id,f.sites.casa,'Good',1,'deployed'],
    ['T-ZERO','Zero stock','AVAILABLE',null,null,'Good',0,'empty'],
    ['T-OFFICE','Legacy office stock','IN_OFFICE',null,f.sites.main,'Good',1,'status']
  ];
  for(const [asset,name,status,holder,site,condition,quantity] of cases)await f.db.query('insert into equipment(id,asset_id,name,status,current_holder_id,site_id,condition,quantity) values($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),asset,name,status,holder,site,condition,quantity]);
  const action=(actor,p_action,p_payload)=>f.rpc(actor,'mcpa_movement_action',{p_action,p_payload,p_operation_id:randomUUID()});
  for(const asset of ['T-RESERVED','T-HANDOVER']){
    const request=await action(f.actors.sky,'createRequest',{toolIds:[asset],destination:'Casa Buena',purpose:'Private inventory fixture'});
    await action(f.actors.admin,'approveRequest',{id:request.id});
    if(asset==='T-HANDOVER')await action(f.actors.admin,'releaseRequest',{id:request.id});
  }
  await go('masterlist');await wait('equipmentList.length>=9');
  await evaluate('itemsPerPage=50;renderTable()');
  for(const [asset,,,,,,,code] of cases){
    const actual=await evaluate(`(()=>{const row=[...document.querySelectorAll('#equipmentTableBody tr')].find(row=>row.querySelector('.tool-id-chip')?.textContent===${q(asset)});return {code:row?.querySelector('[data-requestability]')?.dataset.requestability,text:row?.textContent};})()`);
    assert.equal(actual.code,code,asset);assert.match(actual.text,/Recorded status/);assert.match(actual.text,/New requests/);
  }
  for(const width of [375,393,430,768,1440])for(const dark of [false,true]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<1000});
    await evaluate(`applyTheme(${dark},false)`);await fill('#searchEquipment','T-8861');await evaluate('filterAndResetPage()');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,'No page overflow '+width);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#equipmentTableBody .tool-id-chip')).whiteSpace"),'nowrap');
    const sizing=await evaluate("(()=>{const el=document.querySelector('.equipment-status');return {width:el.getBoundingClientRect().width,overflow:el.scrollWidth>el.clientWidth+1};})()");
    assert.ok(sizing.width>=190&&!sizing.overflow,'Readable status labels '+width);
    await evaluate("document.querySelector('#equipmentTableBody .equipment-status').scrollIntoView({block:'center',inline:'end'})");
    if([375,1440].includes(width))await shot(`inventory-status-${width}-${dark?'dark':'light'}`,true);
  }
  await go('tool-profile?record=T-RESERVED');
  assert.equal(await evaluate("document.querySelector('#profileContent [data-requestability]').dataset.requestability"),'reserved');
  const picker=()=>evaluate("[...document.querySelectorAll('[data-form=create] input[name=toolIds]')].map(el=>el.value)");

  await logout();await login('pau');await wait("MCPAAuth.profile?.id==="+q(f.actors.pau.id));await go('request');
  await wait("document.querySelector('[data-form=create]')");
  assert.ok(!(await evaluate('MovementStore.getState().requests')).some(r=>r.toolIds.includes('T-RESERVED')),'Another engineer cannot see the private reservation');
  for(const asset of ['T-8861','T-8862'])assert.ok((await picker()).includes(asset));
  for(const [asset,,,,,,,code] of cases.filter(row=>row[7]!=='available'))assert.ok(!(await picker()).includes(asset),asset+' excluded: '+code);
  await logout();await login('sky');await wait("MCPAAuth.profile?.id==="+q(f.actors.sky.id));await go('masterlist');
  await wait("document.querySelector('[data-tool=\"T-ASSIGNED\"]')");
  assert.equal(await evaluate("document.querySelector('[data-tool=\"T-ASSIGNED\"]').closest('tr').querySelector('[data-requestability]').dataset.requestability"),'assigned');
  await click('[data-tool="T-ASSIGNED"]');await wait("document.querySelector('#equipment-detail')?.open && !MCPANavigation.restoring");
  assert.equal(await evaluate("document.querySelector('#equipment-detail [data-requestability]').dataset.requestability"),'assigned');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);
  console.log('PASS Admin/Engineer inventory, details and Request Tools share stock rules; hidden locks, custody, condition, quantity and project locations verified at 375/393/430/768/1440 in both themes');
};
