// 1. Initialize Supabase Client
const supabaseUrl = 'https://zpqxlmiqwevhlstjirei.supabase.co';
const supabaseKey = 'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Store fetched data
let equipment = [];

// 2. Fetch from Database
async function fetchMasterlist() {
    const { data, error } = await supabaseClient
        .from('equipment')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching equipment:", error.message);
        return;
    }

    // Map database columns to frontend expectations
    equipment = data.map(item => ({
        assetId: item.asset_id,
        equipmentType: item.name,
        category: item.category || 'Uncategorized', 
        brand: item.brand || 'Unknown',
        site: item.site || 'Site A', 
        holder: item.current_holder_id || 'Unassigned',
        status: formatDbStatus(item.status),
        condition: item.condition || 'Good',
        createdAt: item.created_at
    }));

    renderTable();
}

// Formatting Helpers
function escapeHTML(str) {
    if (!str) return "";
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag)
    );
}

function formatDate(dateString) {
    if (!dateString) return "—";
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

function formatDbStatus(status) {
    if (status === 'IN_USE') return 'In Use';
    if (status === 'REPAIR') return 'For Repair';
    if (status === 'MISSING') return 'Missing';
    return 'Available';
}

function getStatusClass(status) {
    switch (status) {
        case "Available": return "status-available";
        case "In Use": return "status-in-use";
        case "For Repair": return "status-repair";
        case "Missing": return "status-missing";
        default: return "";
    }
}

// Initial Load
fetchMasterlist();
   
// 3. Render Table Data
function renderTable() {
    const search = document.getElementById("searchEquipment").value.toLowerCase().trim();
    const typeFilter = document.getElementById("typeFilter").value;
    const statusFilter = document.getElementById("statusFilter").value;
    const siteFilter = document.getElementById("siteFilter").value;

    const filtered = equipment.filter(item => {
        return (!search || item.assetId.toLowerCase().includes(search) || item.brand.toLowerCase().includes(search)) &&
               (!typeFilter || item.category === typeFilter) &&
               (!statusFilter || item.status === statusFilter) &&
               (!siteFilter || item.site === siteFilter);
    });

    const tbody = document.getElementById("equipmentTableBody");
    tbody.innerHTML = "";
    
    if (filtered.length === 0) {
        document.getElementById("emptyState").classList.add("visible");
        return;
    }
    document.getElementById("emptyState").classList.remove("visible");

    filtered.forEach(item => {
        const row = document.createElement("tr");
        // Updated to 10 columns to match your new HTML table layout
        row.innerHTML = `
            <td><span class="asset-id-badge">${escapeHTML(item.assetId)}</span></td>
            <td><strong>${escapeHTML(item.equipmentType)}</strong></td>
            <td>${escapeHTML(item.category)}</td>
            <td>${escapeHTML(item.brand)}</td>
            <td>${escapeHTML(item.site || "—")}</td>
            <td>${escapeHTML(item.holder || "—")}</td>
            <td><span class="status-pill ${getStatusClass(item.status)}">${escapeHTML(item.status)}</span></td>
            <td>${escapeHTML(item.condition)}</td>
            <td>${formatDate(item.createdAt)}</td>
            <td><button class="view-link" onclick="showProfile('${item.assetId}')">View →</button></td>
        `;
        tbody.appendChild(row);
    });
}

// 4. Handle Profile Modal
function showProfile(assetId) {
    const item = equipment.find(eq => eq.assetId === assetId);
    if (!item) return;

    const content = document.getElementById("profileContent");
    content.innerHTML = `
        <div class="profile-main">
            <div class="title-bar">
                <div>
                    <h1>${escapeHTML(item.equipmentType)} — ${escapeHTML(item.assetId)}</h1>
                    <p>${escapeHTML(item.brand)} • ${escapeHTML(item.serialNumber || 'N/A')}</p>
                </div>
                <span class="status-pill ${getStatusClass(item.status)}">${escapeHTML(item.status)}</span>
            </div>
            <div class="photo-placeholder">
                ${item.photo ? `<img src="${item.photo}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">` : 'No Photo Available'}
            </div>
        </div>
        
        <div class="profile-sidebar">
            <div class="info-card">
                <div class="info-card-header">Tool Information</div>
                <div class="info-row"><span>Tool ID</span><strong><span class="asset-id-badge">${escapeHTML(item.assetId)}</span></strong></div>
                <div class="info-row"><span>Category</span><strong>${escapeHTML(item.category)}</strong></div>
                <div class="info-row"><span>Brand</span><strong>${escapeHTML(item.brand)}</strong></div>
                <div class="info-row"><span>Condition</span><strong>${escapeHTML(item.condition)}</strong></div>
                <div class="info-row"><span>Current Location</span><strong>${escapeHTML(item.site || "—")}</strong></div>
                <div class="info-row"><span>Current Holder</span><strong>${escapeHTML(item.holder || "—")}</strong></div>
                <div class="info-row"><span>Status</span><strong>${escapeHTML(item.status)}</strong></div>
            </div>

            <div class="info-card qr-tag" id="qrContainerProfile">
                <strong>${item.assetId}</strong>
                <p style="font-size:11px; color:var(--text-muted); margin-top:8px;">Scan to open this profile</p>
                <button class="btn btn-outline w-full" style="margin-top:16px;" onclick="printQR('${item.assetId}')">Print Tag</button>
            </div>
        </div>
    `;

    document.getElementById("profileModal").classList.add("active");
    
    setTimeout(() => {
        new QRCode(document.getElementById("qrContainerProfile"), {
            text: item.assetId,
            width: 120, height: 120,
            colorDark: "#111111", colorLight: "#ffffff"
        });
    }, 50);
}

document.getElementById("closeProfileModal").addEventListener("click", () => {
    document.getElementById("profileModal").classList.remove("active");
});

// 5. Insert New Data
document.getElementById('equipmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Grab ALL the new values from your updated HTML form
    const type = document.getElementById('equipmentType').value;
    const category = document.getElementById('equipmentCategory').value;
    const brand = document.getElementById('brand').value;
    const model = document.getElementById('equipmentModel').value;
    const serial = document.getElementById('serialNumber').value;
    const condition = document.getElementById('equipmentCondition').value;
    const tracking = document.getElementById('trackingType').value;
    const quantity = document.getElementById('equipmentQuantity').value;
    const unit = document.getElementById('equipmentUnit').value;
    const details = document.getElementById('identifyingDetails').value;
    
    // A brand new item defaults to 'AVAILABLE'
    const dbStatus = 'AVAILABLE';
    
    const newAssetId = 'T-' + Math.floor(1000 + Math.random() * 9000);

    const { error } = await supabaseClient
        .from('equipment')
        .insert([{ 
            asset_id: newAssetId, 
            name: type, 
            category: category,
            brand: brand,
            model: model,
            serial_number: serial,
            condition: condition,
            tracking_type: tracking,
            quantity: tracking === 'Bulk' ? quantity : 1,
            unit: tracking === 'Bulk' ? unit : null,
            details: details,
            status: dbStatus 
        }]);

    if (error) {
        alert("Error saving tool: " + error.message);
    } else {
        closeAddModal();
        fetchMasterlist();
    }
});

// 6. Modal Toggle Logic & Dynamic Fields
function closeAddModal() {
    document.getElementById('equipmentModal').classList.remove('active');
    document.getElementById('equipmentForm').reset();
    
    // Reset dynamic form fields
    document.getElementById('quantityGroup').style.display = 'none';
    document.getElementById('unitGroup').style.display = 'none';
}

document.getElementById('openAddEquipment').addEventListener('click', () => {
    document.getElementById('equipmentModal').classList.add('active');
});

document.getElementById('closeEquipmentModal').addEventListener('click', closeAddModal);
document.getElementById('cancelEquipmentModal').addEventListener('click', closeAddModal);

// Dynamic Bulk vs Individual Logic
const trackingType = document.getElementById("trackingType");
const quantityGroup = document.getElementById("quantityGroup");
const equipmentQuantity = document.getElementById("equipmentQuantity");
const unitGroup = document.getElementById("unitGroup");
const equipmentUnit = document.getElementById("equipmentUnit");

trackingType.addEventListener("change", function () {
    if (this.value === "Bulk") {
        quantityGroup.style.display = "block";
        unitGroup.style.display = "block";
        equipmentQuantity.required = true;
        equipmentUnit.required = true;
    } else {
        quantityGroup.style.display = "none";
        unitGroup.style.display = "none";
        equipmentQuantity.required = false;
        equipmentUnit.required = false;
        equipmentQuantity.value = 1;
        equipmentUnit.value = "";
    }
});