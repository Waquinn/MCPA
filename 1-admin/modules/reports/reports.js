/* Reports separates current truth from saved historical observations. */
(function () {
 'use strict';
 const root=document.getElementById('screen-reports');
 if(!root||!MCPAAuth.canRoute('reports'))return;
 const $=selector=>root.querySelector(selector),esc=MovementOverview.escape,controller=new AbortController();
 let data=null,exportRows=[],loading=false;
 const date=value=>new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 $('#report-start').value=today.slice(0,8)+'01';$('#report-end').value=today;
 function feedback(message,error=false){$('#report-feedback').textContent=message;$('#report-feedback').setAttribute('role',error?'alert':'status');}
 function table(head,rows){
  return rows.length?'<table><thead><tr>'+head.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<div class="empty-state"><h3>No records for this report</h3><p>Choose another period or report type.</p></div>';
 }
 function render(){
  if(!data)return;
  const kind=$('#report-kind').value;
  $('#report-snapshot-field').hidden=kind!=='history';
  if(kind==='activity'){
   const head=['Date · Manila','Action','Reference','Recorded by','Tools','Details'];
   const rows=data.activity.map(r=>[date(r.createdAt),r.action,r.entityId,r.actor,(r.toolIds||[]).join(', '),r.summary]);
   exportRows=[head,...rows];$('#report-results').innerHTML=table(head,rows);
   $('#report-scope').textContent='Saved movement events from '+data.start+' through '+data.end+' inclusive, in Manila time.';
  }else{
   const snapshot=data.snapshots.find(s=>s.id===$('#report-snapshot').value);
   const tools=kind==='history'?(snapshot?.tools||[]):data.current;
   const head=['Equipment ID','Name','Project','Holder','Quantity','Status','Availability'];
   const rows=tools.filter(t=>EquipmentTracking.quantity(t)>0).map(t=>[t.id,t.name,t.site,t.holder||'Unassigned',EquipmentTracking.quantity(t),STATUS_LABEL[t.status]||t.status,EquipmentTracking.availability(t)]);
   exportRows=[head,...rows];$('#report-results').innerHTML=table(head,rows);
   if(kind==='current')$('#report-scope').textContent='Current inventory as of '+date(data.generatedAt)+' Manila. The date range applies to saved snapshots and movement history; current inventory is a present-day view.';
   else if(snapshot)$('#report-scope').textContent='Inventory observed on '+date(snapshot.capturedAt)+' Manila. Later movements do not change this saved snapshot.';
   else $('#report-scope').textContent='No inventory snapshots were captured in this period. Historical snapshots begin prospectively; past inventory is not reconstructed.'+(data.historicalAvailableFrom?' First recorded snapshot: '+data.historicalAvailableFrom+'.':' Weekly capture needs the monitoring scheduler.');
  }
  $('#report-export').disabled=exportRows.length<=1;
 }
 async function load(){
  if(loading)return;
  const start=$('#report-start').value,end=$('#report-end').value;
  if(!start||!end||start>end){feedback('Choose a valid start and end date.',true);return;}
  loading=true;$('#report-results').setAttribute('aria-busy','true');$('#report-refresh').disabled=true;
  try{
   if(MCPAAuth.isDemo){
    await MovementStore.refresh();const demo=MovementStore.getState();
    data={start,end,generatedAt:new Date().toISOString(),current:demo.tools,snapshots:[],historicalAvailableFrom:null,activity:demo.activity.filter(r=>{const key=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.createdAt));return key>=start&&key<=end;})};
    feedback('Offline demonstration records. No historical company snapshots are loaded.');
   }else{
    const response=await EquipmentTracking.client().rpc('mcpa_monitoring_report',{p_start:start,p_end:end});
    if(response.error)throw response.error;if(!root.isConnected)return;data=response.data;feedback('');
   }
   const previous=$('#report-snapshot').value;
   $('#report-snapshot').innerHTML=data.snapshots.map(s=>'<option value="'+esc(s.id)+'">'+esc(date(s.capturedAt))+' Manila</option>').join('');
   if(data.snapshots.some(s=>s.id===previous))$('#report-snapshot').value=previous;
   render();
  }catch(error){
   $('#report-export').disabled=true;
   feedback(['PGRST202','PGRST205','42883','42P01'].includes(error?.code)?'Monitoring setup is not installed. Ask your administrator to complete setup, then retry.':error?.code==='42501'?'Your account cannot access monitoring reports.':error?.code==='22023'?'Choose a valid reporting range of at most 367 days.':'The report could not load. Check your connection and retry.',true);
  }finally{loading=false;if(root.isConnected){$('#report-results').setAttribute('aria-busy','false');$('#report-refresh').disabled=false;}}
 }
 root.addEventListener('change',event=>{if(['report-kind','report-snapshot'].includes(event.target.id))render();},{signal:controller.signal});
 $('#report-refresh').addEventListener('click',load,{signal:controller.signal});
 $('#report-export').addEventListener('click',()=>{
  const cell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const csv=exportRows.map(row=>row.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download='mcpa-'+$('#report-kind').value+'-'+data.start+'-'+data.end+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 },{signal:controller.signal});
 window.MCPAReports={dispose(){controller.abort();}};
 void load();
})();
