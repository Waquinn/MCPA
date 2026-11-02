import {escape as esc,evidenceButtons,wireEvidence,setup,photoPicker,uploadSelected} from '../custody-lifecycle/ui.mjs';

import '../../display.js';
import {recipientLabel} from '../custody-lifecycle/recipients.mjs';
export {recipientLabel};
export const receiptState=t=>globalThis.MCPADisplay.receiptState(t);
const status=receiptState;
function validateDamage(row){
  if(!row)return;
  const notes=row.querySelector('[name=notes]'),damaged=row.querySelector('[name=condition]').value==='damaged';
  notes.required=damaged;
  notes.setCustomValidity(damaged&&!notes.value.trim()?'Describe the damage before accepting custody.':'');
}

const date=value=>value?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Not recorded';
export async function mount(root,options){
  const ctx=setup(root,options);root.classList.add('transfer-review');wireEvidence(root,ctx);
  let data,view=options.view||'receive',busy=false,search='',statusFilter='';
  const pending=t=>['pending','refused'].includes(t.status);
  function record(t){
    const incoming=t.receiverId===data.profile.id,canDecide=incoming&&t.status==='pending';
    return `<details data-transfer-record="${esc(t.id)}" data-status="${esc(t.status)}" ${options.record===t.id?'open':''}><summary><strong>${esc(t.id)}</strong><span class="badge ${t.status==='received'?'badge-verified':t.status==='rejected'?'badge-discrepancy':'badge-pending'}">${esc(status(t))}</span><span>${esc(t.sender)} → ${esc(t.receiver)}</span></summary>
      <dl class="transfer-facts"><div><dt>Recipient</dt><dd>${esc(t.receiver)}</dd></div><div><dt>Destination / project</dt><dd>${esc(t.destination||'Not recorded')}</dd></div><div><dt>Initiated</dt><dd>${esc(date(t.createdAt))}</dd></div><div><dt>Remarks</dt><dd>${esc(t.notes||'None recorded')}</dd></div></dl>
      <ul class="transfer-assets">${(t.toolIds||[]).map(id=>{
        const source=t.source?.find(s=>s.toolId===id),asset=t.equipment?.find(a=>a.id===id);
        return `<li><strong>${esc(source?.name||asset?.name||id)}</strong> <span class="tool-id-chip">${esc(id)}</span><dl class="transfer-facts"><div><dt>Custodian at initiation</dt><dd>${esc(source?.holder||'Unassigned')}</dd></div><div><dt>Origin</dt><dd>${esc(source?.site||'Not recorded')}</dd></div><div><dt>Recorded condition</dt><dd>${esc(source?.condition||asset?.condition||'Not recorded')}</dd></div><div><dt>Current custodian</dt><dd>${esc(asset?.holder||'Unassigned')}</dd></div></dl></li>`;
      }).join('')}</ul>${evidenceButtons(data.evidence,t.id)}
      ${canDecide?`<p class="transfer-accountability">Custody stays with the current holder until you accept every asset.</p><form data-accept="${esc(t.id)}"><fieldset><legend>Inspect each asset</legend>${(t.toolIds||[]).map(id=>`<div data-inspect="${esc(id)}" class="transfer-inspection"><strong>${esc(id)}</strong><label>Tested condition<select name="condition" required><option value="">Choose condition</option><option value="good">Good</option><option value="damaged">Damaged — accept into repair</option></select></label><label>Condition notes <span>(required for damage)</span><textarea name="notes" maxlength="2000"></textarea></label><label class="transfer-check"><input type="checkbox" name="received" required> Physically received and tested</label>${photoPicker(id)}</div>`).join('')}</fieldset><button class="btn btn-primary" type="submit">Accept Transfer</button></form>
        <details class="transfer-reject"><summary>Reject Transfer</summary><form data-reject="${esc(t.id)}"><label>Rejection reason<textarea name="reason" required maxlength="2000"></textarea></label><label class="transfer-check"><input type="checkbox" name="confirmed" required> Reject this transfer and keep custody unchanged</label><button class="btn btn-secondary" type="submit">Confirm Rejection</button></form></details>`:''}
      ${!incoming&&t.status==='pending'?'<p class="transfer-accountability">Awaiting the recipient’s decision. Custody has not changed.</p>':''}
      ${t.receivedAt?`<p>${status(t)==='Accepted'?'Accepted by':'Receipt recorded by'} ${esc(t.receivedBy||t.receiver)} · ${esc(date(t.receivedAt))}</p>`:''}
      ${t.rejectedAt?`<p>Rejected by ${esc(t.rejectedBy)} · ${esc(date(t.rejectedAt))}</p><p>${esc(t.rejectionReason)}</p>`:''}
      ${t.refusalReason?`<p>Damage refusal: ${esc(t.refusalReason)}</p>`:''}
      ${t.cancellationReason?`<p>Cancellation: ${esc(t.cancellationReason)}</p>`:''}
      ${t.inspections?.length?`<details><summary>Recorded inspection</summary><ul>${t.inspections.map(i=>`<li><strong>${esc(i.toolId)}</strong> · ${esc(i.condition)}${i.disposition?' · '+esc(i.disposition):''}<p>${esc(i.notes||'No notes')}</p></li>`).join('')}</ul></details>`:''}
      ${t.refusalInspections?.length?`<details><summary>Damage refusal inspection</summary><ul>${t.refusalInspections.map(i=>`<li>${esc(i.toolId)} · ${esc(i.condition)} · ${esc(i.notes)}</li>`).join('')}</ul></details>`:''}
      ${(t.allowedActions||[]).map(action=>`<details><summary>${action==='cancelTransfer'?'Cancel Transfer':'Reopen Damage Inspection'}</summary><form data-adjust="${action}" data-id="${esc(t.id)}"><label>Reason<textarea name="reason" required maxlength="2000"></textarea></label><label class="transfer-check"><input type="checkbox" name="confirmed" required> Confirm this action; custody stays unchanged</label><button type="submit" class="btn btn-secondary">${action==='cancelTransfer'?'Confirm Cancellation':'Reopen Inspection'}</button></form></details>`).join('')}
      <a class="transfer-history-link" href="#activity">View audit history</a>
      ${['pending','refused'].includes(t.status)&&['engineer','architect'].includes(data.profile.role)?`<a href="#asset-transfer">Scan equipment or review sender history</a>`:''}
      </details>`;
  }
  function send(){
    return `<form data-send><h2>New transfer</h2><p class="transfer-accountability">The recipient must accept before custody changes.</p><fieldset><legend>Individual equipment</legend>${data.assets.length?data.assets.map(a=>`<label class="transfer-check"><input type="checkbox" name="asset" value="${esc(a.id)}"> <span>${esc(a.name)} <span class="tool-id-chip">${esc(a.id)}</span></span></label>`).join(''):'<p>No eligible assets in your custody or authorized stock.</p>'}</fieldset><div class="transfer-form-grid"><label>Recipient<select name="recipient" required><option value="">Choose recipient</option>${data.recipients.map(p=>`<option value="${esc(p.id)}">${esc(recipientLabel(p,data))}</option>`).join('')}</select></label><label>Destination<select name="destination" required><option value="">Choose recipient first</option></select></label></div><p data-recipient-confirmation role="status" aria-live="polite">Choose a recipient and destination to review the transfer.</p><label>Remarks <span>(optional)</span><textarea name="notes" maxlength="2000"></textarea></label><button type="submit" class="btn btn-primary" ${data.assets.length?'':'disabled'}>Request Transfer</button>${['engineer','architect'].includes(data.profile.role)?'<a href="#asset-transfer">Scan QR codes and attach photos</a>':''}</form>`;
  }
  function render(){
    const incoming=data.transfers.filter(t=>t.receiverId===data.profile.id&&pending(t));
    let records=view==='receive'?incoming:view==='send'?data.transfers.filter(t=>t.actorId===data.profile.id&&pending(t)):data.transfers.filter(t=>!pending(t));
    if(view==='history'&&['admin','tool_handler'].includes(data.profile.role))records=data.transfers;
    if(options.record){const target=data.transfers.find(t=>t.id===options.record);if(target&&!records.includes(target))records=[target,...records];}
    ctx.content.innerHTML=`<div class="page-head"><h1>Transfers</h1><span>${incoming.length} awaiting your decision</span></div><div class="transfer-tabs" role="group" aria-label="Transfer views">${[['receive','Incoming'],['send','Outgoing'],['history',data.profile.role==='admin'?'All transfers':'History']].map(([key,label])=>`<button class="btn ${view===key?'btn-primary':'btn-secondary'}" type="button" data-view="${key}" aria-pressed="${view===key}">${label}</button>`).join('')}</div>${view==='send'?send():''}<section aria-label="Transfer records">${records.length?records.map(record).join(''):`<p class="empty-state">${view==='receive'?'No incoming transfers awaiting your decision.':view==='send'?'No outgoing transfers awaiting acceptance.':'No completed transfers.'}</p>`}</section>`;
    ctx.content.setAttribute('aria-busy','false');
    if(options.record&&!data.transfers.some(t=>t.id===options.record))ctx.say('This transfer is unavailable to your account.',true);
    const tabs=root.querySelector('.transfer-tabs');
    tabs.insertAdjacentHTML('afterend',`<details class="transfer-tools-link"><summary>Receiving QR and transfer lookup</summary><a href="#transfer-tools">Open receiving QR, scanner and movement history tools</a></details>${view==='history'?`<div class="transfer-form-grid"><label>Search history<input type="search" data-history-search placeholder="ID, equipment, person or project" value="${esc(search)}"></label><label>Status<select data-history-status><option value="">All statuses</option>${['pending','received','rejected','refused','canceled'].map(key=>`<option value="${key}" ${statusFilter===key?'selected':''}>${esc(status({status:key}))}</option>`).join('')}</select></label></div><p data-history-empty hidden>No transfers match these filters.</p>`:''}`);
    filterHistory();
  }
  function filterHistory(){
    if(view!=='history')return;
    let count=0;root.querySelectorAll('[data-transfer-record]').forEach(element=>{const t=data.transfers.find(t=>t.id===element.dataset.transferRecord);const text=[t.id,t.sender,t.receiver,t.destination,t.notes,...(t.toolIds||[]),...(t.equipment||[]).map(a=>a.name)].join(' ').toLowerCase();element.hidden=Boolean((search&&!text.includes(search.toLowerCase()))||(statusFilter&&element.dataset.status!==statusFilter));if(!element.hidden)count++;});
    const empty=root.querySelector('[data-history-empty]');if(empty)empty.hidden=count>0;
  }
  const refresh=async()=>{if(busy)return false;data=await ctx.api.snapshot();if(ctx.disposed)return false;render();return true;};
  root.addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(!button||busy)return;view=button.dataset.view;options.record='';render();root.querySelector(`[data-view="${view}"]`).focus();},{signal:ctx.signal});
  root.addEventListener('change',event=>{
    if(event.target.matches('[name=condition],[name=notes]'))validateDamage(event.target.closest('[data-inspect]'));
    if(event.target.matches('[data-history-status]')){statusFilter=event.target.value;filterHistory();return;}
    if(!event.target.matches('[name=recipient],[name=destination]'))return;
    if(event.target.matches('[name=destination]')){confirmRecipient();return;}
    const person=data.recipients.find(p=>p.id===event.target.value),dest=root.querySelector('[name=destination]');
    dest.innerHTML='<option value="">Choose destination</option>'+data.sites.filter(s=>person&&(person.role==='admin'?s.office:s.assignedEngineerId===person.id)).map(s=>`<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
    confirmRecipient();
  },{signal:ctx.signal});
  function confirmRecipient(){const person=data.recipients.find(p=>p.id===root.querySelector('[name=recipient]')?.value),destination=root.querySelector('[name=destination]')?.value;const target=root.querySelector('[data-recipient-confirmation]');if(target)target.textContent=person?'Transfer to '+recipientLabel(person,data)+(destination?' at '+destination:'; choose a destination')+'. Custody changes only after this recipient accepts.':'Choose a recipient and destination to review the transfer.';}
  root.addEventListener('input',event=>{if(event.target.matches('[name=notes]'))validateDamage(event.target.closest('[data-inspect]'));if(event.target.matches('[data-history-search]')){search=event.target.value;filterHistory();}},{signal:ctx.signal});
  root.addEventListener('submit',event=>{
    const form=event.target;if(!form.matches('[data-send],[data-accept],[data-reject],[data-adjust]'))return;event.preventDefault();if(busy)return;
    void ctx.task(async()=>{
      const fd=new FormData(form);let action,payload;
      if(form.hasAttribute('data-send')){action='createTransfer';payload={toolIds:fd.getAll('asset'),receiverId:fd.get('recipient'),destination:fd.get('destination'),notes:fd.get('notes')};if(!payload.toolIds.length)throw Error('Select at least one Asset ID.');}
      else if(form.dataset.accept){action='receiveTransfer';payload={id:form.dataset.accept,inspections:[...form.querySelectorAll('[data-inspect]')].map(row=>({toolId:row.dataset.inspect,condition:row.querySelector('[name=condition]').value,notes:row.querySelector('[name=notes]').value,physicallyReceived:row.querySelector('[name=received]').checked,tested:row.querySelector('[name=received]').checked,disposition:'accepted'}))};const invalid=payload.inspections.find(i=>!i.physicallyReceived||!i.condition||(i.condition==='damaged'&&!i.notes.trim()));if(invalid){const row=[...form.querySelectorAll('[data-inspect]')].find(r=>r.dataset.inspect===invalid.toolId),field=row.querySelector('[name=notes]');validateDamage(row);field.reportValidity();throw Error('Inspect every asset and describe any damage.');}}
      else{action=form.dataset.adjust||'rejectTransfer';payload={id:form.dataset.id||form.dataset.reject,reason:fd.get('reason'),confirmed:fd.get('confirmed')==='on'};}
      busy=true;
      try{if(action==='receiveTransfer')payload.evidenceIds=await uploadSelected(form,ctx,'accept_transfer',payload.id);const saved=await ctx.api.mutate(action,payload,'transfer:'+ (payload.id||'new'));options.record=saved.id;view=action==='createTransfer'?'send':'history';ctx.say(action==='createTransfer'?'Transfer requested. Custody is unchanged.':action==='receiveTransfer'?'Transfer accepted. Custody updated.':action==='rejectTransfer'?'Transfer rejected. Custody is unchanged.':'Transfer updated. Custody is unchanged.');options.onChanged?.(saved);}
      finally{busy=false;}
      await refresh();
    },event.submitter);
  },{signal:ctx.signal});
  await ctx.task(refresh);
  return {refresh,destroy(){ctx.destroy();root.classList.remove('transfer-review');}};
}
