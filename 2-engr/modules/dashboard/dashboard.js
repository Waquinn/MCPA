/* ============================================================
   ENGINEER DASHBOARD SCRIPT (dashboard.js)
   FOOLPROOF VERSION
   ============================================================ */

window.renderEngrDashboard = function() {
  const currentUser = "Engineer B"; 
  const assignedSites = ["Metropolis", "San Gabriel"];

  const screenDash = document.getElementById('screen-dashboard');
  if (!screenDash) {
    console.error("Critical Error: Cannot find #screen-dashboard wrapper.");
    return;
  }

  // 1. FORCIBLY INJECT THE ENTIRE HTML LAYOUT
  screenDash.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="display" id="welcome-message">Welcome back, ${currentUser}</h1>
        <p class="sub">Here is your assigned equipment and site overview.</p>
      </div>
      <div class="page-head-actions">
        <button class="btn btn-primary" onclick="showScreen('request')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="16" height="16"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
          Request Tool
        </button>
        <button class="btn btn-secondary" onclick="showScreen('return')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="16" height="16"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1012-11.7L3 7"/></svg>
          Return Tool
        </button>
        <button class="btn btn-danger" onclick="showScreen('repair')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
          Report Issue
        </button>
      </div>
    </header>

    <section class="grid grid-3" style="margin-top: 24px;">
      <div class="card kpi accent">
        <div class="kpi-top">
          <div class="kpi-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 10-5.66 5.66l-6 6a2 2 0 002.83 2.83l6-6a4 4 0 005.66-5.66L14.7 6.3z"/></svg></div>
        </div>
        <div>
          <div class="num" id="kpi-assigned-count">0</div>
          <div class="lbl">Tools Assigned to You</div>
        </div>
      </div>
      <div class="card kpi">
        <div class="kpi-top">
          <div class="kpi-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div>
          <span id="kpi-repair-badge" class="badge badge-underrepair hidden">Action Needed</span>
        </div>
        <div>
          <div class="num" id="kpi-repair-count">0</div>
          <div class="lbl">Your Tools For Repair</div>
        </div>
      </div>
      <div class="card kpi">
        <div class="kpi-top">
          <div class="kpi-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></div>
          <span id="kpi-missing-badge" class="badge badge-missing hidden">Urgent</span>
        </div>
        <div>
          <div class="num" id="kpi-missing-count">0</div>
          <div class="lbl">Missing Under Your Custody</div>
        </div>
      </div>
    </section>

    <div class="two-col" style="margin-top: 24px;">
      <section>
        <div class="section-title">
          <h2>My Assigned Tools</h2>
          <button class="icon-btn see-all" onclick="showScreen('masterlist')">View All</button>
        </div>
        <div class="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tool ID</th>
                <th>Details</th>
                <th>Site</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="engr-tools-tbody"></tbody>
          </table>
        </div>
      </section>

      <section>
        <div class="section-title">
          <h2>Active Site Inventory</h2>
        </div>
        <div class="grid" id="engr-sites-grid"></div>
      </section>
    </div>
  `;

  // 2. APPLY DATA LOGIC
  if (typeof TOOLS === 'undefined') {
    console.error("TOOLS data array is missing. Ensure data.js is loaded.");
    return;
  }

  const myTools = TOOLS.filter(t => t.holder === currentUser); 
  const toolsForRepair = myTools.filter(t => ['repair', 'underrepair'].includes(t.status));
  const toolsMissing = myTools.filter(t => t.status === 'missing');

  document.getElementById('kpi-assigned-count').textContent = myTools.length;
  document.getElementById('kpi-repair-count').textContent = toolsForRepair.length;
  document.getElementById('kpi-missing-count').textContent = toolsMissing.length;

  if (toolsForRepair.length > 0) document.getElementById('kpi-repair-badge').classList.remove('hidden');
  if (toolsMissing.length > 0) document.getElementById('kpi-missing-badge').classList.remove('hidden');

  const tbody = document.getElementById('engr-tools-tbody');
  if (myTools.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No tools assigned to you currently.</td></tr>`;
  } else {
    tbody.innerHTML = myTools.slice(0, 5).map(tool => {
      const statusClass = tool.status ? tool.status.replace(/\s+/g, '').toLowerCase() : 'unknown';
      const statusText = (typeof STATUS_LABEL !== 'undefined' && STATUS_LABEL[tool.status]) ? STATUS_LABEL[tool.status] : tool.status;
      return `
        <tr class="clickable">
          <td><span class="tool-id-chip">${tool.id}</span></td>
          <td><div class="cell-name">${tool.name}</div><div class="cell-sub">${tool.brand} • ${tool.cat}</div></td>
          <td><div class="badge badge-disposed" style="background:var(--off-white); color:var(--black);">${tool.site}</div></td>
          <td><span class="badge badge-${statusClass}">${statusText}</span></td>
        </tr>
      `;
    }).join('');
  }

  const siteGrid = document.getElementById('engr-sites-grid');
  siteGrid.innerHTML = assignedSites.map(site => {
    const siteTools = TOOLS.filter(t => t.site === site && t.qty > 0);
    const toolTally = {};
    siteTools.forEach(t => { toolTally[t.name] = (toolTally[t.name] || 0) + t.qty; });
    
    const entries = Object.entries(toolTally);
    let statsHtml = entries.length === 0 
      ? `<div class="site-stat"><span class="l">No equipment on site</span></div>` 
      : entries.map(([name, qty]) => `<div class="site-stat"><span class="n">${qty}</span><span class="l">${name}</span></div>`).join('');

    return `
      <div class="card site-card" tabindex="0">
        <div class="site-card-top">
          <div><h3>${site}</h3><div class="eng">Managed by You</div></div>
        </div>
        <div class="site-stat-row">${statsHtml}</div>
      </div>
    `;
  }).join('');
};

// 3. EXECUTE
setTimeout(() => { 
  if (document.getElementById('screen-dashboard')) {
    window.renderEngrDashboard(); 
  }
}, 50);