if (typeof supabaseClient === 'undefined') {
  const supabaseUrl = 'https://zpqxlmiqwevhlstjirei.supabase.co';
  const supabaseKey = 'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58';
  window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

var equipmentList = [];
var currentEditId = null; 

let currentPage = 1;
let selectedAssets = []; 
let bulkActionMode = ''; // Tracks if we are updating 'status' or 'location'
const itemsPerPage = 10;

function filterAndResetPage() {
  currentPage = 1;
  renderTable();
}

async function initMasterlist() {
  const tbody = document.getElementById("equipmentTableBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--gray);">Loading data...</td></tr>`;

  const { data, error } = await supabaseClient
    .from('equipment')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching equipment:", error.message);
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:red;">Failed to load data.</td></tr>`;
    return;
  }

  equipmentList = (data || []).map(item => ({
    assetId: item.asset_id,
    equipmentType: item.name,
    category: item.category || 'Uncategorized',
    brand: item.brand || 'Unknown',
    model: item.model || '—',
    serialNumber: item.serial_number || '—',
    site: item.site || 'Casa Buena',
    holder: item.current_holder_id || '—',
    status: formatDbStatus(item.status),
    condition: item.condition || 'Good',
    trackingType: item.tracking_type || 'Individual',
    quantity: item.quantity || 1,
    unit: item.unit || '',
    details: item.details || '—',
    createdAt: item.created_at
  }));

  populateFilters();
  renderTable();
  setupMasterlistListeners();
}

function populateFilters() {
  const typeFilter = document.getElementById("typeFilter");
  const siteFilter = document.getElementById("siteFilter");
  
  if (typeFilter) {
    const currentType = typeFilter.value;
    const categories = [...new Set(equipmentList.map(item => item.category).filter(Boolean))].sort();
    typeFilter.innerHTML = '<option value="">Category</option>' + categories.map(c => `<option value="${c}">${escapeHTML(c)}</option>`).join('');
    typeFilter.value = currentType;
  }
  
  if (siteFilter) {
    const currentSite = siteFilter.value;
    const sites = [...new Set(equipmentList.map(item => item.site).filter(Boolean))].sort();
    siteFilter.innerHTML = '<option value="">Site</option>' + sites.map(s => `<option value="${s}">${escapeHTML(s)}</option>`).join('');
    siteFilter.value = currentSite;
  }
}

function formatDbStatus(status) {
  if (!status) return 'available';
  const s = status.toString().toUpperCase();
  if (s === 'IN_USE') return 'inuse';
  if (s === 'REPAIR') return 'repair';
  if (s === 'MISSING') return 'missing';
  return 'available';
}

function getBadgeClass(status) {
  switch (status) {
    case "available": return "badge-available";
    case "inuse": return "badge-inuse";
    case "repair": return "badge-repair";
    case "missing": return "badge-missing";
    default: return "";
  }
}

function getConditionColor(condition) {
  switch(condition.toLowerCase()) {
    case 'good': return 'color: #059669; background: #d1fae5;'; 
    case 'fair': return 'color: #d97706; background: #fef3c7;'; 
    case 'damaged': return 'color: #dc2626; background: #fee2e2;'; 
    default: return 'color: #6b7280; background: #f3f4f6;'; 
  }
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulkActionBar');
  const countSpan = document.getElementById('selectedCount');
  if (!bar || !countSpan) return;

  if (selectedAssets.length > 0) {
    bar.style.display = 'flex';
    countSpan.innerText = selectedAssets.length;
  } else {
    bar.style.display = 'none';
  }
}

function updateSelectAllState() {
  const checkboxes = Array.from(document.querySelectorAll('.row-checkbox'));
  const selectAllCb = document.getElementById('selectAll');
  if (!selectAllCb) return;

  if (checkboxes.length > 0 && checkboxes.every(cb => cb.checked)) {
    selectAllCb.checked = true;
  } else {
    selectAllCb.checked = false;
  }
}

function handleCheckboxChange(assetId, isChecked) {
  if (isChecked && !selectedAssets.includes(assetId)) {
    selectedAssets.push(assetId);
  } else if (!isChecked) {
    selectedAssets = selectedAssets.filter(id => id !== assetId);
  }
}

// --- NEW MODAL BULK FUNCTIONS ---
function clearBulkSelection() {
  selectedAssets = []; 
  document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false); 
  updateSelectAllState();
  updateBulkActionBar();
}

function bulkUpdateStatus() {
  if (selectedAssets.length === 0) return;
  bulkActionMode = 'status';
  document.getElementById('bulkModalTitle').innerText = `Update Status (${selectedAssets.length} items)`;
  document.getElementById('bulkStatusField').style.display = 'block';
  document.getElementById('bulkLocationField').style.display = 'none';
  document.getElementById('bulkStatusSelect').required = true;
  document.getElementById('bulkLocationInput').required = false;
  document.getElementById('bulkActionForm').reset();
  document.getElementById('bulkActionModal').style.display = 'flex';
}

function bulkAssignLocation() {
  if (selectedAssets.length === 0) return;
  bulkActionMode = 'location';
  document.getElementById('bulkModalTitle').innerText = `Assign Location (${selectedAssets.length} items)`;
  document.getElementById('bulkStatusField').style.display = 'none';
  document.getElementById('bulkLocationField').style.display = 'block';
  document.getElementById('bulkStatusSelect').required = false;
  document.getElementById('bulkLocationInput').required = true;
  document.getElementById('bulkActionForm').reset();
  document.getElementById('bulkActionModal').style.display = 'flex';
}

function closeBulkModal() {
  document.getElementById('bulkActionModal').style.display = 'none';
  document.getElementById('bulkActionForm').reset();
}
// ---------------------------------

function renderTable() {
  const searchInput = document.getElementById("searchEquipment");
  const typeFilter = document.getElementById("typeFilter");
  const statusFilter = document.getElementById("statusFilter");
  const siteFilter = document.getElementById("siteFilter");

  const search = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const typeVal = typeFilter ? typeFilter.value : "";
  const statusVal = statusFilter ? statusFilter.value : "";
  const siteVal = siteFilter ? siteFilter.value : "";

  const filtered = equipmentList.filter(item => {
    return (!search || item.assetId.toLowerCase().includes(search) || item.brand.toLowerCase().includes(search) || item.equipmentType.toLowerCase().includes(search)) &&
           (!typeVal || item.category === typeVal) &&
           (!statusVal || item.status === statusVal.toLowerCase().replace(/\s+/g, '')) &&
           (!siteVal || item.site === siteVal);
  });

  const tbody = document.getElementById("equipmentTableBody");
  const emptyState = document.getElementById("emptyState");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    renderPagination(0, 0, 0, 0);
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedItems = filtered.slice(startIndex, endIndex);

  paginatedItems.forEach(item => {
    const row = document.createElement("tr");
    row.className = "clickable";
    
    row.innerHTML = `
      <td style="padding:12px; border-bottom:1px solid var(--line);">
        <input type="checkbox" class="row-checkbox" value="${escapeHTML(item.assetId)}" ${selectedAssets.includes(item.assetId) ? 'checked' : ''}>
      </td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">
        <span class="tool-id-chip">${escapeHTML(item.assetId)}</span>
      </td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">
        <div class="cell-name" style="font-weight:600;">${escapeHTML(item.equipmentType)}</div>
        <div class="cell-sub" style="font-size:11px; color:var(--gray);">${escapeHTML(item.model !== '—' ? item.model : 'Standard')}</div>
      </td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">${escapeHTML(item.category)}</td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">${escapeHTML(item.brand)}</td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">${escapeHTML(item.site)}</td>
      <td style="padding:12px; border-bottom:1px solid var(--line);"><span class="badge ${getBadgeClass(item.status)}">${item.status.toUpperCase()}</span></td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">${escapeHTML(item.condition)}</td>
      <td style="padding:12px; border-bottom:1px solid var(--line);">${formatDate(item.createdAt)}</td>
      <td style="padding:12px; border-bottom:1px solid var(--line); text-align:right;">
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="showToolProfile('${item.assetId}')" style="padding:4px 8px; border:none; background:none; color:var(--gold); font-weight:600; cursor:pointer;">View</button>
          <button class="btn btn-secondary btn-sm" onclick="editTool('${item.assetId}')" style="padding:4px 8px; border:none; background:none; color:var(--gray); cursor:pointer;">Edit</button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  renderPagination(totalItems, startIndex, endIndex, totalPages);
  updateSelectAllState();
}

function renderPagination(total, start, end, totalPages) {
  const container = document.getElementById('paginationContainer');
  const infoEl = document.getElementById('paginationInfo');
  const controlsEl = document.getElementById('paginationControls');
  
  if (!container || !infoEl || !controlsEl) return;

  if (total === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'flex';
  infoEl.innerHTML = `Showing <strong>${start + 1}-${end}</strong> of <strong>${total}</strong> entries`;

  let buttonsHtml = `<button class="btn btn-secondary btn-sm" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">Prev</button>`;
  
  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) {
      buttonsHtml += `<button class="btn btn-accent btn-sm">${i}</button>`;
    } else {
      buttonsHtml += `<button class="btn btn-secondary btn-sm" onclick="changePage(${i})">${i}</button>`;
    }
  }

  buttonsHtml += `<button class="btn btn-secondary btn-sm" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next</button>`;
  controlsEl.innerHTML = buttonsHtml;
}

function changePage(page) {
  currentPage = page;
  renderTable();
}

function showMasterlistView(viewName) {
  const masterlistScreen = document.getElementById('screen-masterlist');
  const profileScreen = document.getElementById('screen-tool-profile');

  if (viewName === 'masterlist') {
    if (masterlistScreen) masterlistScreen.style.display = 'block';
    if (profileScreen) profileScreen.style.display = 'none';
  } else if (viewName === 'tool-profile') {
    if (masterlistScreen) masterlistScreen.style.display = 'none';
    if (profileScreen) profileScreen.style.display = 'block';
  }
}

function showToolProfile(assetId) {
  const item = equipmentList.find(eq => eq.assetId === assetId);
  if (!item) return;

  const content = document.getElementById("profileContent");
  if (!content) return;

  content.innerHTML = `
    <div class="two-col" style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; margin-top:16px;">
      <div>
        <div class="page-head" style="margin-bottom:16px;">
          <div>
            <h1 class="display" style="font-size:20px; font-weight:700; margin:0 0 4px 0;">${escapeHTML(item.equipmentType)} — ${escapeHTML(item.assetId)}</h1>
            <p class="sub" style="color:var(--gray); font-size:13px; margin:0;">${escapeHTML(item.brand)} · ${escapeHTML(item.model !== '—' ? item.model : 'Standard Model')}</p>
          </div>
          <span class="badge ${getBadgeClass(item.status)}" style="padding:8px 14px; text-transform:uppercase;">${item.status}</span>
        </div>

        <div class="card" style="aspect-ratio:16/9; display:flex; align-items:center; justify-content:center; background:#f4f4f4; color:#666; margin-bottom:22px; border-radius:8px; border:1px solid var(--line);">
          <div style="text-align:center;">
            <div style="font-size:13px; font-weight:600;">Tool Photo Placeholder</div>
          </div>
        </div>

        <div class="section-title"><h2 style="font-size:15px; font-weight:600; margin-bottom:8px;">Movement History</h2></div>
        <div class="card card-pad" style="background:#fff; padding:16px; border-radius:8px; border:1px solid var(--line);">
          <div class="timeline">
            <div class="tl-item">
              <div class="tl-date" style="font-size:11px; color:var(--gray);">${formatDate(item.createdAt)}</div>
              <div class="tl-title" style="font-weight:600; font-size:13px;">Registered into Masterlist</div>
              <div class="tl-detail" style="font-size:12px; color:#555; margin-top:2px;">Item added to inventory database with initial condition: ${escapeHTML(item.condition)}.</div>
              <div class="tl-meta" style="font-size:11px; margin-top:4px;"><span>Status <b>${item.status.toUpperCase()}</b></span></div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="section-title"><h2 style="font-size:15px; font-weight:600; margin-bottom:8px;">Tool Information</h2></div>
        <div class="card card-pad" style="background:#fff; padding:16px; border-radius:8px; border:1px solid var(--line); margin-bottom:22px;">
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Tool ID</span><span class="v" style="font-weight:600;"><span class="tool-id-chip">${escapeHTML(item.assetId)}</span></span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Category</span><span class="v" style="font-weight:600;">${escapeHTML(item.category)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Brand</span><span class="v" style="font-weight:600;">${escapeHTML(item.brand)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Model</span><span class="v" style="font-weight:600;">${escapeHTML(item.model)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Serial Number</span><span class="v mono" style="font-weight:600;">${escapeHTML(item.serialNumber)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Condition</span><span class="v" style="font-weight:600;">${escapeHTML(item.condition)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Tracking Type</span><span class="v" style="font-weight:600;">${escapeHTML(item.trackingType)}</span></div>
          ${item.trackingType === 'Bulk' ? `<div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Quantity & Unit</span><span class="v" style="font-weight:600;">${escapeHTML(item.quantity)}${escapeHTML(item.unit)}</span></div>` : ''}
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Identifying Details</span><span class="v" style="font-weight:600;">${escapeHTML(item.details)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Current Location</span><span class="v" style="font-weight:600;">${escapeHTML(item.site)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span class="k" style="color:var(--gray); font-size:13px;">Current Holder</span><span class="v" style="font-weight:600;">${escapeHTML(item.holder)}</span></div>
          <div class="kv" style="display:flex; justify-content:space-between; padding:8px 0;"><span class="k" style="color:var(--gray); font-size:13px;">Status</span><span class="v" style="font-weight:600;"><span class="badge ${getBadgeClass(item.status)}">${item.status.toUpperCase()}</span></span></div>
        </div>

        <div class="section-title"><h2 style="font-size:15px; font-weight:600; margin-bottom:8px;">Actions & QR Tag</h2></div>
        <div class="card card-pad" style="background:#fff; padding:16px; border-radius:8px; border:1px solid var(--line); text-align:center;">
          <div id="qrContainerProfile" style="margin:0 auto 12px; display:inline-block; min-width:96px; min-height:96px;"></div>
          <div style="font-weight:700; font-size:13px; margin-bottom:14px;">${escapeHTML(item.assetId)}</div>
          
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-secondary btn-block btn-sm" onclick="editTool('${item.assetId}')" style="padding:8px; cursor:pointer;">Edit Tool</button>
            <button class="btn btn-secondary btn-block btn-sm" onclick="printQRTag('${item.assetId}')" style="padding:8px; cursor:pointer;">Print Tag</button>
          </div>
        </div>
      </div>
    </div>
  `;

  showMasterlistView('tool-profile');

  setTimeout(() => {
    const qrEl = document.getElementById("qrContainerProfile");
    if (qrEl) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(item.assetId)}`;
      qrEl.innerHTML = `<img src="${qrUrl}" alt="QR Code" style="width:96px; height:96px; border-radius:4px; display:block; margin:0 auto;">`;
    }
  }, 50);
}

function editTool(assetId) {
  const item = equipmentList.find(eq => eq.assetId === assetId);
  if (!item) return;
  
  currentEditId = assetId;

  document.getElementById('equipmentType').value = item.equipmentType || '';
  document.getElementById('equipmentCategory').value = item.category || '';
  document.getElementById('brand').value = item.brand !== 'Unknown' ? item.brand : '';
  document.getElementById('equipmentModel').value = item.model !== '—' ? item.model : '';
  document.getElementById('serialNumber').value = item.serialNumber !== '—' ? item.serialNumber : '';
  document.getElementById('equipmentCondition').value = item.condition || 'Good';
  document.getElementById('trackingType').value = item.trackingType || 'Individual';
  document.getElementById('equipmentQuantity').value = item.quantity || 1;
  document.getElementById('equipmentUnit').value = item.unit || '';
  document.getElementById('identifyingDetails').value = item.details !== '—' ? item.details : '';

  const trackingSelect = document.getElementById('trackingType');
  if (trackingSelect) trackingSelect.dispatchEvent(new Event('change'));

  const modal = document.getElementById('equipmentModal');
  if (modal) {
    const modalTitle = modal.querySelector('h2');
    const modalSubmitBtn = modal.querySelector('button[type="submit"]');
    
    if (modalTitle) modalTitle.innerText = `Edit Tool: ${assetId}`;
    if (modalSubmitBtn) modalSubmitBtn.innerText = 'Update Item';
    
    modal.style.display = 'flex';
  }
}

function setupMasterlistListeners() {
  const openBtn = document.getElementById('openAddEquipment');
  const closeBtn = document.getElementById('closeEquipmentModal');
  const cancelBtn = document.getElementById('cancelEquipmentModal');
  const exportBtn = document.getElementById('exportBtn'); 
  const modal = document.getElementById('equipmentModal');
  const form = document.getElementById('equipmentForm');
  const trackingType = document.getElementById('trackingType');

  // --- CONNECTING THE NEW BULK BUTTONS ---
  const btnBulkStatus = document.getElementById('btnBulkStatus');
  const btnBulkLocation = document.getElementById('btnBulkLocation');
  const btnBulkCancel = document.getElementById('btnBulkCancel');
  
  if (btnBulkStatus) btnBulkStatus.onclick = bulkUpdateStatus;
  if (btnBulkLocation) btnBulkLocation.onclick = bulkAssignLocation;
  if (btnBulkCancel) btnBulkCancel.onclick = clearBulkSelection;

  // --- CONNECTING THE BULK MODAL CLOSE BUTTONS ---
  const closeBulkBtn = document.getElementById('closeBulkModal');
  const cancelBulkBtn = document.getElementById('cancelBulkModal');
  
  if (closeBulkBtn) closeBulkBtn.onclick = closeBulkModal;
  if (cancelBulkBtn) cancelBulkBtn.onclick = closeBulkModal;

  // --- HANDLING THE BULK FORM SUBMIT ---
  const bulkForm = document.getElementById('bulkActionForm');
  if (bulkForm) {
    bulkForm.onsubmit = async (e) => {
      e.preventDefault();
      
      let updatePayload = {};
      
      if (bulkActionMode === 'status') {
        const newStatus = document.getElementById('bulkStatusSelect').value;
        if (!newStatus) return;
        updatePayload = { status: newStatus };
      } else if (bulkActionMode === 'location') {
        const newLocation = document.getElementById('bulkLocationInput').value;
        if (!newLocation.trim()) return;
        updatePayload = { site: newLocation.trim() };
      }

      // Send to Supabase
      const { error } = await supabaseClient
        .from('equipment')
        .update(updatePayload)
        .in('asset_id', selectedAssets);

      if (error) {
        alert("Error updating items: " + error.message);
      } else {
        closeBulkModal();
        clearBulkSelection(); 
        initMasterlist(); 
      }
    };
  }
  // ----------------------------------------

  // Listen for clicks on the "Select All" header checkbox
  const selectAllBtn = document.getElementById('selectAll');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const rowCheckboxes = document.querySelectorAll('.row-checkbox');
      
      rowCheckboxes.forEach(cb => {
        cb.checked = isChecked;
        handleCheckboxChange(cb.value, isChecked);
      });
      
      updateBulkActionBar();
    });
  }

  // Listen for clicks on individual row checkboxes (using event delegation)
  const tbody = document.getElementById('equipmentTableBody');
  if (tbody) {
    tbody.addEventListener('change', (e) => {
      if (e.target.classList.contains('row-checkbox')) {
        handleCheckboxChange(e.target.value, e.target.checked);
        updateSelectAllState();
        updateBulkActionBar();
      }
    });
  }

  if (openBtn && modal) {
    openBtn.onclick = () => {
      currentEditId = null; 
      
      const modalTitle = modal.querySelector('h2');
      const modalSubmitBtn = modal.querySelector('button[type="submit"]');
      
      if (modalTitle) modalTitle.innerText = 'Add New Item';
      if (modalSubmitBtn) modalSubmitBtn.innerText = 'Save Item';
      if (form) form.reset();
      
      modal.style.display = 'flex';
    };
  }

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
    if (form) form.reset();
    currentEditId = null;
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;
  if (exportBtn) exportBtn.onclick = exportMasterlist;

  if (trackingType) {
    trackingType.onchange = function() {
      const qGroup = document.getElementById('quantityGroup');
      const uGroup = document.getElementById('unitGroup');
      if (this.value === 'Bulk') {
        if (qGroup) qGroup.style.display = 'block';
        if (uGroup) uGroup.style.display = 'block';
      } else {
        if (qGroup) qGroup.style.display = 'none';
        if (uGroup) uGroup.style.display = 'none';
      }
    };
  }

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      
      const payload = {
        name: document.getElementById('equipmentType').value,
        category: document.getElementById('equipmentCategory').value,
        brand: document.getElementById('brand').value,
        model: document.getElementById('equipmentModel').value,
        serial_number: document.getElementById('serialNumber').value,
        condition: document.getElementById('equipmentCondition').value,
        tracking_type: document.getElementById('trackingType').value,
        quantity: document.getElementById('trackingType').value === 'Bulk' ? document.getElementById('equipmentQuantity').value : 1,
        unit: document.getElementById('trackingType').value === 'Bulk' ? document.getElementById('equipmentUnit').value : null,
        details: document.getElementById('identifyingDetails').value
      };

      if (currentEditId) {
        const { error } = await supabaseClient
          .from('equipment')
          .update(payload)
          .eq('asset_id', currentEditId);

        if (error) alert("Error updating tool: " + error.message);
        else {
          closeModal();
          initMasterlist(); 
        }
      } else {
        const newAssetId = 'T-' + Math.floor(1000 + Math.random() * 9000);
        payload.asset_id = newAssetId;
        payload.status = 'AVAILABLE';
        
        const { error } = await supabaseClient
          .from('equipment')
          .insert([payload]);

        if (error) alert("Error saving tool: " + error.message);
        else {
          closeModal();
          initMasterlist();
        }
      }
    };
  }
}

function printQRTag(assetId) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(assetId)}`;
  const printWin = window.open('', '_blank', 'width=400,height=400');
  
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print Tag - ${assetId}</title>
      <style>
        @page { margin: 2mm; }
        body { 
          font-family: 'Inter', system-ui, sans-serif; 
          display: flex; align-items: center; justify-content: center; 
          height: 100vh; margin: 0; background: #fff;
        }
        .label-container { text-align: center; padding: 8px; }
        .company-name {
          font-size: 8px; font-weight: 700; letter-spacing: 0.05em;
          text-transform: uppercase; color: #111; margin-bottom: 4px;
        }
        img { width: 30mm; height: 30mm; margin-bottom: 4px; }
        .asset-id { font-size: 11px; font-weight: 800; letter-spacing: 0.05em; color: #111; }
      </style>
    </head>
    <body>
      <div class="label-container">
        <div class="company-name">BuildRight Corp.</div>
        <img src="${qrUrl}" alt="QR Code" onload="window.print(); window.close();" />
        <div class="asset-id">${assetId}</div>
      </div>
    </body>
    </html>
  `);
  printWin.document.close();
}

function exportMasterlist() {
  const searchInput = document.getElementById("searchEquipment");
  const typeFilter = document.getElementById("typeFilter");
  const statusFilter = document.getElementById("statusFilter");
  const siteFilter = document.getElementById("siteFilter");

  const search = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const typeVal = typeFilter ? typeFilter.value : "";
  const statusVal = statusFilter ? statusFilter.value : "";
  const siteVal = siteFilter ? siteFilter.value : "";

  const filtered = equipmentList.filter(item => {
    return (!search || item.assetId.toLowerCase().includes(search) || item.brand.toLowerCase().includes(search) || item.equipmentType.toLowerCase().includes(search)) &&
           (!typeVal || item.category === typeVal) &&
           (!statusVal || item.status === statusVal.toLowerCase().replace(/\s+/g, '')) &&
           (!siteVal || item.site === siteVal);
  });

  const currentDate = new Date().toLocaleString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
    hour: '2-digit', minute: '2-digit'
  });

  const tableRows = filtered.map(item => `
    <tr>
      <td style="font-family:monospace; font-weight:bold;">${escapeHTML(item.assetId)}</td>
      <td>${escapeHTML(item.equipmentType)}</td>
      <td>${escapeHTML(item.category)}</td>
      <td>${escapeHTML(item.site)}</td>
      <td>${escapeHTML(item.holder)}</td>
      <td>${item.status.toUpperCase()}</td>
    </tr>
  `).join('');

  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Masterlist Export Receipt</title>
      <style>
        body { font-family: 'Inter', system-ui, sans-serif; color: #111; padding: 40px; }
        .header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { font-size: 24px; margin: 0 0 4px 0; }
        .header p { font-size: 13px; color: #555; margin: 0; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 20px; }
        th { text-align: left; background: #f4f4f4; padding: 12px; border-bottom: 2px solid #ddd; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
        td { padding: 12px; border-bottom: 1px solid #ddd; }
        .footer { margin-top: 40px; font-size: 11px; color: #888; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>BuildRight Corp. - Tools & Equipment Receipt</h1>
        <p><strong>Status Report Printed On:</strong> ${currentDate}</p>
        <p><strong>Total Items Listed:</strong> ${filtered.length}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Asset ID</th>
            <th>Item Name</th>
            <th>Category</th>
            <th>Location</th>
            <th>Holder</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="footer">
        Generated by Fieldmark Asset Management System
      </div>
      
      <script>
        window.onload = () => {
          window.print();
          window.close();
        };
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
}

function escapeHTML(str) {
  if (!str) return "";
  return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

initMasterlist();