(async function () {
  const root=document.getElementById('screen-reports');if(!root||!MCPAAuth.canRoute('reports'))return;
  root.innerHTML='<p role="status">Loading current monitoring records…</p>';
  const esc=MovementOverview.escape;
  try{
    await MovementStore.refresh();if(!root.isConnected)return;
    const data=MovementStore.getState();
    const rows=data.tools.filter(t=>EquipmentTracking.quantity(t)>0);
    root.innerHTML=`<div class="page-head"><div><h1 class="display">Inventory monitoring</h1><p class="sub">Current site, custody and condition · ${esc(new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'}))} Manila</p></div><button class="btn btn-secondary" id="report-export">Export CSV</button></div><p class="account-message">${MCPAAuth.isDemo?'Offline demo records. ':''}A current snapshot for weekly monitoring. Pending returns are not a separate recorded state; confirmed returns appear in Activity Logs.</p><div class="card table-wrap"><table><thead><tr><th>Equipment</th><th>Project</th><th>Holder</th><th>Quantity</th><th>Status</th><th>Availability</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${esc(t.id)} · ${esc(t.name)}</td><td>${esc(t.site)}</td><td>${esc(t.holder||'Unassigned')}</td><td>${EquipmentTracking.quantity(t)}</td><td>${esc(STATUS_LABEL[t.status]||t.status)}</td><td>${esc(EquipmentTracking.availability(t))}</td></tr>`).join('')}</tbody></table></div>`;
    root.querySelector('#report-export').onclick=()=>{
      const cell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
      const csv=[['Equipment ID','Name','Project','Holder','Quantity','Status','Availability'],...rows.map(t=>[t.id,t.name,t.site,t.holder,t.qty,t.status,EquipmentTracking.availability(t)])].map(r=>r.map(cell).join(',')).join('\r\n');
      const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='mcpa-inventory-monitoring.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
  }catch(_){if(root.isConnected)root.innerHTML='<p role="alert">Monitoring records could not load. Check your access and connection, then reopen Reports.</p>';}
})();
