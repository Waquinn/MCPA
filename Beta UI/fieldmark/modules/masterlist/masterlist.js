/* ============================================================
   MASTERLIST MODULE
   Uses the shared TOOLS / STATUS_LABEL data from js/data.js.
   ============================================================ */
function renderMasterlist(filter){
  const q = (filter||'').trim().toLowerCase();
  const rows = TOOLS.filter(t=>{
    if(!q) return true;
    return [t.id,t.name,t.cat,t.brand,t.site,t.holder].join(' ').toLowerCase().includes(q);
  });
  const body = document.getElementById('masterlist-body');
  if(!body) return;
  if(rows.length===0){
    body.innerHTML = `<tr><td colspan="10"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
      <div class="t">No tools match "${filter}"</div>
      <div class="d">Try a different tool ID, name, brand, or site.</div>
    </div></td></tr>`;
    return;
  }
  body.innerHTML = rows.map(t=>`
    <tr class="clickable" onclick="showScreen('tool-profile')">
      <td><span class="tool-id-chip">${t.id}</span></td>
      <td class="cell-name">${t.name}</td>
      <td>${t.cat}</td>
      <td>${t.brand}</td>
      <td class="mono">${t.qty}</td>
      <td>${t.site}</td>
      <td>${t.holder}</td>
      <td><span class="badge badge-${t.status}">${STATUS_LABEL[t.status]}</span></td>
      <td>${t.acquired}</td>
      <td style="text-align:right; color:var(--gray);">View →</td>
    </tr>
  `).join('');
}

function filterMasterlist(){
  const input = document.getElementById('masterlist-search');
  renderMasterlist(input ? input.value : '');
}

renderMasterlist('');
