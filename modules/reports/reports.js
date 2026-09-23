(function () {
  'use strict';
  let context, revision=0, data={}, errors={}, active='equipment', page=1, filtered=[], columns=[], loaded=false;
  const q = selector => context.root.querySelector(selector);
  const R = () => window.MCPARecords;
  const size = () => window.MCPA.getPreferences?.().pageSize || 25;
  const definitions = {
    equipment:['Equipment','equipment'],sites:['Equipment by site','sites'],movement:['Equipment movements','equipment_transfers'],
    accountability:['Equipment accountability','equipment'],missing:['Missing equipment','equipment'],
    repairs:['Equipment requiring repair','equipment'],purchases:['Consumable purchase requests','consumable_requests'],consumables:['Consumable stock','consumables']
  };
  function dataset() {
    const sites=R().map(data.sites), people=R().map(data.profiles), equipment=R().map(data.equipment);
    const siteName=id => id ? sites.get(String(id))?.name || 'Site '+id : 'Unassigned';
    const holder=id => id ? people.has(String(id)) ? R().person(people.get(String(id))) : id : 'Unassigned';
    if (['equipment','missing','repairs','accountability'].includes(active)) {
      let rows=data.equipment || [];
      if (active==='missing') rows=rows.filter(row=>String(row.status).toUpperCase()==='MISSING');
      if (active==='repairs') rows=rows.filter(row=>['REPAIR','FOR_REPAIR','UNDER_REPAIR'].includes(String(row.status).toUpperCase()));
      if (active==='accountability') rows=rows.filter(row=>row.current_holder_id);
      columns=['Asset ID','Equipment','Category','Site','Holder','Status','Quantity','Unit','Condition'];
      return rows.map(row=>[row.asset_id,row.name,row.category || 'Uncategorized',siteName(row.site_id),holder(row.current_holder_id),R().status(row.status),row.quantity,row.unit || '',row.condition || 'Unspecified']);
    }
    if (active==='sites') {
      columns=['Site','Location','Engineer','Status','Equipment records','Equipment units'];
      const values=(data.sites||[]).map(row=>{
        const items=(data.equipment||[]).filter(item=>String(item.site_id)===String(row.id));
        return [row.name,row.location,row.assigned_engineer,R().status(row.status),errors.equipment?'Unavailable':items.length,errors.equipment?'Unavailable':items.reduce((sum,item)=>sum+R().quantity(item),0)];
      });
      const unassigned=(data.equipment||[]).filter(row=>!row.site_id);
      if (unassigned.length) values.push(['Unassigned','—','—','—',unassigned.length,unassigned.reduce((sum,item)=>sum+R().quantity(item),0)]);
      return values;
    }
    if (active==='movement') {
      columns=['Movement ID','Type','Asset ID','Equipment','From site','To site','From holder','To holder','Status','Notes','Created'];
      return (data.equipment_transfers||[]).map(row=>[row.id,row.kind?R().status(row.kind):'Transfer (legacy)',equipment.get(String(row.equipment_id))?.asset_id || row.equipment_id,equipment.get(String(row.equipment_id))?.name || 'Unavailable equipment',siteName(row.from_site_id),siteName(row.to_site_id),holder(row.from_user_id),holder(row.to_user_id),R().status(row.workflow_status || row.status),row.notes || '',R().date(row.created_at)]);
    }
    if (active==='purchases') {
      columns=['Request','Item','Quantity','Received','Unit','Requester','Needed by','Status','Purpose','Created'];
      return (data.consumable_requests||[]).map(row=>[R().requestReference(row),row.item_name,row.quantity,row.received_quantity,row.unit,row.requester,R().date(row.needed_by),R().status(row.status),row.purpose,R().date(row.created_at)]);
    }
    columns=['Item','Unit','Stock','Minimum stock','Status','Last updated'];
    return (data.consumables||[]).map(row=>[row.name,row.unit,row.current_stock,row.minimum_stock,Number(row.current_stock)===0?'Out of stock':Number(row.current_stock)<Number(row.minimum_stock)?'Low stock':'In stock',R().date(row.updated_at)]);
  }
  function render(all=false) {
    const search=q('#reports-search').value.trim().toLowerCase();
    filtered=dataset().filter(row=>row.some(value=>String(value??'').toLowerCase().includes(search)));
    page=Math.max(1,Math.min(page,Math.ceil(filtered.length/size())||1));
    const sourceError=!!errors[definitions[active][1]];
    q('#reports-title').textContent=definitions[active][0];
    q('#reports-count').textContent=filtered.length+' matching records';
    R().renderTable(q('#reports-head'),q('#reports-rows'),columns,all?filtered:filtered.slice((page-1)*size(),page*size()),!loaded?'Loading records…':sourceError?'This report could not be loaded. Refresh to retry.':'No matching records.');
    q('#reports-page').textContent='Page '+page+' of '+(Math.ceil(filtered.length/size())||1);
    q('[data-action="previous"]').disabled=page<=1;
    q('[data-action="next"]').disabled=page*size()>=filtered.length;
    q('[data-action="export"]').disabled=!loaded || sourceError || !filtered.length;
    q('[data-action="print"]').disabled=!loaded || sourceError || !filtered.length;
    q('.tabs').querySelectorAll('[data-report]').forEach(button=>{
      button.classList.toggle('active',button.dataset.report===active);
      button.setAttribute('aria-selected',String(button.dataset.report===active));
    });
  }
  async function load() {
    const local=context, token=++revision;
    loaded=false; q('[data-action="refresh"]').disabled=true; q('#reports-status').textContent='Loading reports…'; render();
    const result=await R().readSources(['equipment','sites','profiles','equipment_transfers','consumables','consumable_requests']);
    if (!local.isCurrent()||token!==revision) return;
    data=result.data;errors=result.errors;loaded=true;
    q('[data-action="refresh"]').disabled=false;
    q('#reports-status').textContent=R().readableErrors(errors)||'Reports are up to date. Exports include all matching rows.';
    const equipment=data.equipment, total=equipment.reduce((sum,row)=>sum+R().quantity(row),0), inUse=equipment.filter(row=>String(row.status).toUpperCase()==='IN_USE').reduce((sum,row)=>sum+R().quantity(row),0);
    const kpis=[['Equipment units',errors.equipment?'—':total],['In use',errors.equipment?'—':total?(100*inUse/total).toFixed(1)+'%':'0%'],['Sites',errors.sites?'—':data.sites.length],['Low or empty stock items',errors.consumables?'—':data.consumables.filter(row=>Number(row.current_stock)===0||Number(row.current_stock)<Number(row.minimum_stock)).length]];
    q('#reports-kpis').innerHTML=kpis.map(([title,value])=>'<div class="card kpi"><div class="lbl">'+R().esc(title)+'</div><div class="num">'+R().esc(value)+'</div></div>').join('');
    render();
  }
  window.MCPAModules=window.MCPAModules||{};
  window.MCPAModules.reports={
    init(next) {
      context=next;data={};errors={};active='equipment';page=1;loaded=false;
      q('#reports-search').addEventListener('input',()=>{page=1;render();},{signal:next.signal});
      next.root.addEventListener('click',event=>{
        const button=event.target.closest('button');if(!button||button.disabled)return;
        if(button.dataset.report){active=button.dataset.report;page=1;render();}
        if(button.dataset.action==='refresh')load();
        if(button.dataset.action==='previous'){page--;render();}
        if(button.dataset.action==='next'){page++;render();}
        if(button.dataset.action==='export')R().download('mcpa-'+active,columns,filtered);
        if(button.dataset.action==='print'){render(true);window.print();render();}
      },{signal:next.signal});
      return load();
    },
    destroy(){revision++;context=null;}
  };
})();
