(function () {
  'use strict';
  let context, revision=0, rows=[], filtered=[], page=1, loaded=false;
  const R=()=>MCPARecords, q=selector=>context.root.querySelector(selector);
  const columns=['Date / time','Source','Action','Item','Actor','Details'];
  function render() {
    const search=q('#activity-search').value.trim().toLowerCase(), source=q('#activity-source').value;
    filtered=rows.filter(row=>(!source||row.values[1]===source)&&row.values.some(value=>String(value??'').toLowerCase().includes(search))).map(row=>row.values);
    const size=MCPA.getPreferences().pageSize, pages=Math.max(1,Math.ceil(filtered.length/size));
    page=Math.min(Math.max(1,page),pages);
    R().renderTable(q('#activity-head'),q('#activity-rows'),columns,filtered.slice((page-1)*size,page*size),loaded?'No matching history records.':'Loading history…');
    q('#activity-page').textContent=`Page ${page} of ${pages} · ${filtered.length} records`;
    q('[data-action=previous]').disabled=page<=1;q('[data-action=next]').disabled=page>=pages;
    q('[data-action=export]').disabled=!loaded||!filtered.length;
  }
  async function load() {
    const local=context, token=++revision;
    loaded=false;q('[data-action=refresh]').disabled=true;q('#activity-status').textContent='Loading history…';render();
    const {data,errors}=await R().readSources(['equipment_history','equipment','sites','profiles','consumable_stock_movements','consumables']);
    if(!local.isCurrent()||token!==revision)return;
    const equipment=R().map(data.equipment),sites=R().map(data.sites),profiles=R().map(data.profiles),items=R().map(data.consumables);
    const actor=id=>id?(profiles.get(String(id))?.name||id):'Not recorded';
    const site=id=>id?(sites.get(String(id))?.name||id):'Unassigned';
    rows=data.equipment_history.map(row=>{
      const e=equipment.get(String(row.equipment_id)),d=row.details||{};
      const detail=[d.state?R().status(d.state):'',Object.hasOwn(d,'from_site_id')?site(d.from_site_id)+' → '+site(d.to_site_id):'',d.notes||''].filter(Boolean).join(' · ');
      return {date:row.created_at,values:[R().date(row.created_at),'Equipment',String(row.action||'Recorded').replaceAll('_',' '),e?e.asset_id+' — '+e.name:row.equipment_id,actor(row.actor_id),detail]};
    }).concat(data.consumable_stock_movements.map(row=>{
      const item=items.get(String(row.consumable_id));
      return {date:row.created_at,values:[R().date(row.created_at),'Consumables',R().status(row.kind),item?.name||row.consumable_id,'Not recorded',`${row.quantity_change} ${item?.unit||''}; balance ${row.balance_after}. ${row.note||''}`]};
    })).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    loaded=true;q('[data-action=refresh]').disabled=false;
    q('#activity-status').textContent=R().readableErrors(errors)||'History updated.';
    render();
  }
  window.MCPAModules.activity={init(next){context=next;rows=[];page=1;loaded=false;
    ['#activity-search','#activity-source'].forEach(selector=>q(selector).addEventListener('input',()=>{page=1;render();},{signal:next.signal}));
    next.root.addEventListener('click',event=>{const b=event.target.closest('button');if(!b||b.disabled)return;
      if(b.dataset.action==='refresh')load();
      if(b.dataset.action==='previous'){page--;render();}if(b.dataset.action==='next'){page++;render();}
      if(b.dataset.action==='export')R().download('activity-history',columns,filtered);
    },{signal:next.signal});return load();},destroy(){revision++;context=null;}};
})();
