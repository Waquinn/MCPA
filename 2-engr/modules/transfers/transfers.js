/* ============================================================
   TRANSFERS MODULE (Live Mobile QR Scanner & Inspection)
   ============================================================ */

window.renderTransfers = function() {
  const screenTransfers = document.getElementById('screen-transfer');
  if (!screenTransfers) return;

  // 1. Inject HTML with the live #qr-reader target
  screenTransfers.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="display">Receive Tools</h1>
        <p class="sub">Scan a transfer QR code to accept custody of tools.</p>
      </div>
    </header>

    <!-- STEP 1: Live Scanner View -->
    <div id="qr-scanner-view" class="card card-pad mobile-focus">
      <div class="scanner-container">
        
        <!-- The library will inject the live camera feed into this exact div -->
        <div id="qr-reader" style="width: 100%; border-radius: var(--radius-lg); overflow: hidden; border: 2px solid var(--line);"></div>
        
        <p class="scanner-hint" style="margin-top: 16px;">Align the giving engineer's Transfer QR within the frame.</p>
        
        <!-- Kept for desktop testing when no camera is present -->
        <button class="btn btn-secondary btn-block" onclick="window.simulateQRScan()" style="margin-top:20px;">
          [Dev] Simulate Successful Scan
        </button>
      </div>
    </div>

    <!-- STEP 2: The Inspection Checklist -->
    <div id="qr-inspection-view" class="hidden">
      <div class="notice" style="margin-bottom: 24px;">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="18" height="18"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        <div>
          <div class="t">Mandatory Tool Testing</div>
          <div class="d">You must test and confirm the condition of each item below before accepting accountability.</div>
        </div>
      </div>

      <div class="transfer-meta card card-pad" style="margin-bottom: 24px;">
        <div class="kv"><span class="k">Transferring From:</span><span class="v" id="tf-giver"></span></div>
        <div class="kv"><span class="k">Previous Site:</span><span class="v" id="tf-prev-site"></span></div>
        <div class="kv">
          <span class="k">Destination Site:</span>
          <span class="v">
            <select id="tf-new-site" class="field" style="width:auto; padding: 4px 8px; margin:0;" onchange="window.validateTransfer()">
              <option value="">Select Site...</option>
              <option value="Metropolis">Metropolis</option>
              <option value="San Gabriel">San Gabriel</option>
            </select>
          </span>
        </div>
      </div>

      <h3 class="eyebrow" style="margin-bottom: 12px;">Tools to Inspect (<span id="tf-tool-count">0</span>)</h3>
      <div id="inspection-list" class="grid grid-2"></div>

      <div class="action-footer">
        <button class="btn btn-secondary" onclick="window.resetScanner()">Cancel</button>
        <button id="btn-confirm-transfer" class="btn btn-primary" disabled onclick="window.confirmTransfer()">
          Confirm & Accept Accountability
        </button>
      </div>
    </div>
  `;

  // Initialize the live camera immediately after the HTML renders
  window.startCameraScanner();
};

// State Variables
window.testedToolsCount = 0;
window.totalToolsRequired = 0;
window.html5QrcodeScanner = null;

// 2. LIVE CAMERA INITIALIZATION
window.startCameraScanner = function() {
  if (typeof Html5QrcodeScanner === 'undefined') {
    console.error("html5-qrcode library is not loaded in index.html");
    return;
  }

  // Clear existing instance if it exists
  if (window.html5QrcodeScanner) {
    window.html5QrcodeScanner.clear();
  }

  // Mount the camera scanner inside the #qr-reader div
  window.html5QrcodeScanner = new Html5QrcodeScanner(
    "qr-reader",
    { fps: 10, qrbox: { width: 250, height: 250 } },
    /* verbose= */ false
  );

  window.html5QrcodeScanner.render(window.onScanSuccess, window.onScanFailure);
};

// 3. SUCCESSFUL SCAN LOGIC
window.onScanSuccess = function(decodedText, decodedResult) {
  // Shutdown the camera to save mobile battery
  if (window.html5QrcodeScanner) {
    window.html5QrcodeScanner.clear();
  }

  try {
    // Attempt to parse the QR data as JSON
    const payload = JSON.parse(decodedText);
    
    // Basic validation to ensure it's an MCPA QR code
    if (payload.giver && payload.tools) {
      document.getElementById('qr-scanner-view').classList.add('hidden');
      document.getElementById('qr-inspection-view').classList.remove('hidden');
      window.loadInspectionChecklist(payload);
    } else {
      alert("Invalid QR format. This does not look like an MCPA transfer payload.");
      window.startCameraScanner(); // Restart camera
    }
  } catch (error) {
    console.error("QR Parse Error:", error);
    alert("Could not read QR code. Ensure you are scanning a valid MCPA transfer code.");
    window.startCameraScanner(); // Restart camera
  }
};

window.onScanFailure = function(error) {
  // Quiet fail. This triggers 10 times a second while searching for a QR code.
};

// Desktop Testing Fallback
window.mockQRPayload = {
  giver: "John Kiel",
  previousSite: "Casa Buena",
  tools: [
    { id: "GRD-001", name: "Grinder", brand: "Bosch", condition: "Good" },
    { id: "BRN-004", name: "Barena (Post Hole Digger)", brand: "Stanley", condition: "Good" }
  ]
};

window.simulateQRScan = function() {
  if (window.html5QrcodeScanner) {
    window.html5QrcodeScanner.clear(); // Shut off real camera if active
  }
  document.getElementById('qr-scanner-view').classList.add('hidden');
  document.getElementById('qr-inspection-view').classList.remove('hidden');
  window.loadInspectionChecklist(window.mockQRPayload);
};

// 4. CHECKLIST LOGIC
window.loadInspectionChecklist = function(payload) {
  document.getElementById('tf-giver').textContent = payload.giver;
  document.getElementById('tf-prev-site').textContent = payload.previousSite;
  document.getElementById('tf-tool-count').textContent = payload.tools.length;
  
  window.testedToolsCount = 0;
  window.totalToolsRequired = payload.tools.length;
  
  const listEl = document.getElementById('inspection-list');
  listEl.innerHTML = payload.tools.map(tool => `
    <div class="card inspection-card">
      <div class="ic-header">
        <div class="ic-info">
          <span class="tool-id-chip">${tool.id}</span>
          <h4>${tool.name}</h4>
          <div class="cell-sub">${tool.brand}</div>
        </div>
      </div>
      <div class="ic-actions">
        <label class="toggle-row">
          <span class="toggle-label">Tested & Confirmed</span>
          <div class="toggle-switch">
            <input type="checkbox" onchange="window.handleTestToggle(this)">
            <span class="slider"></span>
          </div>
        </label>
        <button class="btn btn-sm btn-danger flag-btn" onclick="window.flagDamage('${tool.id}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
          Report Issue
        </button>
      </div>
    </div>
  `).join('');
  
  window.validateTransfer();
};

window.handleTestToggle = function(checkbox) {
  if (checkbox.checked) {
    window.testedToolsCount++;
    checkbox.closest('.inspection-card').classList.add('tested-ok');
  } else {
    window.testedToolsCount--;
    checkbox.closest('.inspection-card').classList.remove('tested-ok');
  }
  window.validateTransfer();
};

window.flagDamage = function(toolId) {
  alert(`Opening damage report flow for ${toolId}. This will automatically route the tool for repair and absolve you of financial liability.`);
};

window.validateTransfer = function() {
  const confirmBtn = document.getElementById('btn-confirm-transfer');
  const siteSelect = document.getElementById('tf-new-site').value;
  
  if (window.testedToolsCount === window.totalToolsRequired && siteSelect !== "") {
    confirmBtn.disabled = false;
  } else {
    confirmBtn.disabled = true;
  }
};

window.confirmTransfer = function() {
  const confirmBtn = document.getElementById('btn-confirm-transfer');
  confirmBtn.innerHTML = "Processing...";
  
  setTimeout(() => {
    alert("Transfer Confirmed! You are now accountable for these tools.");
    window.resetScanner();
    showScreen('dashboard'); 
  }, 800);
};

window.resetScanner = function() {
  document.getElementById('qr-inspection-view').classList.add('hidden');
  document.getElementById('qr-scanner-view').classList.remove('hidden');
  document.getElementById('tf-new-site').value = "";
  window.testedToolsCount = 0;
  
  // Restart the live camera feed so they can scan the next engineer
  window.startCameraScanner();
};

// Execute immediately when loaded
setTimeout(() => { 
  if (document.getElementById('screen-transfer')) {
    window.renderTransfers(); 
  }
}, 50);