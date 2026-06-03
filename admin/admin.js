/* ==========================================
   ADMIN PANEL ENGINE - SHIVORAH CONTROL CENTRE
   ========================================== */

let supabaseAdmin = null;
let currentTab = 'analytics';
let adminUser = null;

// Storage arrays
let products = [];
let collections = [];
let orders = [];
let inventoryHistory = [];
let mediaList = [];
let homepageSettings = {};

// Temp storage for form images
let tempUploadedImages = [];

// Delete items reference
let deleteCallback = null;

// Initialize Supabase and check Auth Session
async function initAdminPanel() {
    const url = window.ENV?.SUPABASE_URL || localStorage.getItem('SUPABASE_URL');
    const key = window.ENV?.SUPABASE_ANON_KEY || localStorage.getItem('SUPABASE_ANON_KEY');
    
    if (!url || !key) {
        alert("Database connection is not configured. Redirecting to authorization portal.");
        window.location.href = 'auth.html';
        return;
    }
    
    try {
        supabaseAdmin = supabase.createClient(url, key);
        
        // Check Session
        const { data: { session } } = await supabaseAdmin.auth.getSession();
        if (!session) {
            window.location.href = 'auth.html';
            return;
        }
        
        adminUser = session.user;
        
        // Verify Role
        const { data: profile, error: profileErr } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', adminUser.id)
            .single();
            
        if (profileErr || !profile || profile.role !== 'admin') {
            alert("Security Violation: Lacking authorization credentials.");
            await supabaseAdmin.auth.signOut();
            window.location.href = 'auth.html';
            return;
        }
        
        // Render user details in UI
        const emailEl = document.getElementById('user-email');
        const initialEl = document.getElementById('user-initial');
        if (emailEl) emailEl.innerText = adminUser.email;
        if (initialEl) initialEl.innerText = adminUser.email.charAt(0).toUpperCase();
        
        // Initial load of reference values
        await refreshReferenceData();
        
        // Show Content workspace and switch to default tab
        document.getElementById('loading-spinner').classList.add('hidden');
        document.getElementById('content-area').classList.remove('hidden');
        
        // Auto-generate slug listener on product form
        setupSlugGenerator();
        
        // Switch to starting tab
        switchTab(currentTab);
        
    } catch (err) {
        console.error("Initialization failed:", err);
        alert("Verification failure: " + err.message);
        window.location.href = 'auth.html';
    }
}

async function refreshReferenceData() {
    if (!supabaseAdmin) return;
    
    try {
        // Load collections
        const { data: colData } = await supabaseAdmin.from('collections').select('*').order('name');
        collections = colData || [];
        
        // Load products
        const { data: prodData } = await supabaseAdmin.from('products').select('*').order('created_at', { ascending: false });
        products = prodData || [];
        
        // Update Select Lists in Forms
        updateCollectionSelectLists();
    } catch (err) {
        console.error("Reference load failure:", err);
    }
}

function updateCollectionSelectLists() {
    const list = document.getElementById('prod-collection');
    if (!list) return;
    
    list.innerHTML = '<option value="">No Collection</option>';
    collections.forEach(col => {
        list.innerHTML += `<option value="${col.id}">${col.name}</option>`;
    });
}

function setupSlugGenerator() {
    const nameInput = document.getElementById('prod-name');
    const slugInput = document.getElementById('prod-slug');
    if (nameInput && slugInput) {
        nameInput.addEventListener('input', () => {
            // Only update slug if not currently editing an existing product (new add only)
            const idVal = document.getElementById('prod-id').value;
            if (!idVal) {
                slugInput.value = nameInput.value
                    .toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, '') // remove special symbols
                    .replace(/\s+/g, '-')         // spaces to hyphens
                    .replace(/-+/g, '-');         // collapse duplicate hyphens
            }
        });
    }
}

// ------------------------------------------
// ROUTING & SECTION DISPLAY SWITCH
// ------------------------------------------
async function switchTab(tabId) {
    currentTab = tabId;
    
    // Highlight sidebar active tabs
    const buttons = document.querySelectorAll('nav button');
    buttons.forEach(btn => btn.classList.remove('active-tab'));
    
    const activeBtn = document.getElementById(`tab-${tabId}`);
    if (activeBtn) activeBtn.classList.add('active-tab');
    
    // Update header
    const titleEl = document.getElementById('section-title');
    if (titleEl) {
        const sectionsNames = {
            analytics: 'Dashboard Analytics',
            products: 'Product Management',
            collections: 'Collection Management',
            inventory: 'Inventory & Stock History',
            orders: 'Orders Tracking Log',
            media: 'Media Library File Explorer',
            homepage: 'Homepage Sections Manager'
        };
        titleEl.innerText = sectionsNames[tabId] || 'Control Console';
    }
    
    // Render view layout inside content container
    const container = document.getElementById('content-area');
    if (!container) return;
    
    container.innerHTML = `<div class="py-20 flex justify-center"><span class="material-symbols-outlined text-3xl animate-spin text-primary">sync</span></div>`;
    
    try {
        if (tabId === 'analytics') {
            await loadAnalyticsData();
            renderAnalytics();
        } else if (tabId === 'products') {
            await refreshReferenceData();
            renderProducts();
        } else if (tabId === 'collections') {
            await refreshReferenceData();
            renderCollections();
        } else if (tabId === 'inventory') {
            await loadInventoryData();
            renderInventory();
        } else if (tabId === 'orders') {
            await loadOrdersData();
            renderOrders();
        } else if (tabId === 'media') {
            await loadMediaData();
            renderMedia();
        } else if (tabId === 'homepage') {
            await loadHomepageData();
            renderHomepageCMS();
        }
    } catch (err) {
        container.innerHTML = `
            <div class="bg-red-500/10 border border-red-500/20 text-red-200 p-6 rounded-sm text-center">
                <span class="material-symbols-outlined text-4xl mb-2 text-red-400">error</span>
                <h4 class="text-sm font-semibold uppercase tracking-wider">Tab loading failure</h4>
                <p class="text-xs text-gray-400 mt-2">${err.message}</p>
            </div>
        `;
    }
}

// Mobile sidebar controls
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        if (sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.remove('-translate-x-full');
        } else {
            sidebar.classList.add('-translate-x-full');
        }
    }
}

// Auth Sign Out
async function logoutAdmin() {
    if (confirm("Sign out from Admin Management System?")) {
        await supabaseAdmin.auth.signOut();
        window.location.href = 'auth.html';
    }
}


/* ==========================================
   TAB PANELS LOGICAL LOADERS & RENDERERS
   ========================================== */

// ------------------------------------------
// PANEL: ANALYTICS DASHBOARD
// ------------------------------------------
async function loadAnalyticsData() {
    const { data: ord } = await supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false });
    orders = ord || [];
    
    const { data: prod } = await supabaseAdmin.from('products').select('*');
    products = prod || [];
}

function renderAnalytics() {
    const container = document.getElementById('content-area');
    
    // Calculations
    // Paid orders total amount
    const paidOrders = orders.filter(o => o.payment_status === 'paid' && o.order_status !== 'cancelled');
    const totalSales = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    const totalOrdersCount = orders.length;
    const pendingOrdersCount = orders.filter(o => o.order_status === 'pending').length;
    
    // Inventory Valuation
    const inventoryValuation = products.reduce((sum, p) => sum + (parseFloat(p.price || 0) * (p.inventory_qty || 0)), 0);
    
    // Best Selling Products calculation
    const salesMap = {};
    orders.forEach(o => {
        if (o.order_status === 'cancelled') return;
        const items = o.items || [];
        items.forEach(it => {
            salesMap[it.name] = (salesMap[it.name] || 0) + (it.qty || 1);
        });
    });
    
    const bestSellers = Object.keys(salesMap).map(name => ({
        name,
        qty: salesMap[name]
    })).sort((a,b) => b.qty - a.qty).slice(0, 5);

    container.innerHTML = `
        <div class="space-y-8">
            <!-- Summary Stats Card Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Stat Card -->
                <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm">
                    <span class="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block">Total Sales</span>
                    <h3 class="text-3xl font-bold text-primary-container mt-2">$${totalSales.toFixed(2)}</h3>
                    <p class="text-[10px] text-gray-400 mt-2 font-medium">Accumulated paid transactions</p>
                </div>
                <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm">
                    <span class="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block">Total Orders</span>
                    <h3 class="text-3xl font-bold text-white mt-2">${totalOrdersCount}</h3>
                    <p class="text-[10px] text-primary mt-2 font-medium">${pendingOrdersCount} orders require review</p>
                </div>
                <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm">
                    <span class="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block">Avg. Order Value</span>
                    <h3 class="text-3xl font-bold text-white mt-2">$${totalOrdersCount > 0 ? (totalSales / paidOrders.length || 0).toFixed(2) : '0.00'}</h3>
                    <p class="text-[10px] text-gray-400 mt-2 font-medium">Per completed transaction</p>
                </div>
                <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm">
                    <span class="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block">Inventory Value</span>
                    <h3 class="text-3xl font-bold text-white mt-2">$${inventoryValuation.toFixed(2)}</h3>
                    <p class="text-[10px] text-gray-400 mt-2 font-medium">Stock levels valuation</p>
                </div>
            </div>

            <!-- Detailed Breakdowns -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- Best Sellers -->
                <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm lg:col-span-1">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-4 mb-4">Best Sellers Volume</h4>
                    <div class="space-y-4">
                        ${bestSellers.length === 0 ? `<p class="text-xs text-gray-500 italic py-4">No records logged</p>` : bestSellers.map((item, idx) => `
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <span class="text-xs font-bold text-primary-container">#${idx+1}</span>
                                    <span class="text-sm font-semibold text-white truncate max-w-[150px]">${item.name}</span>
                                </div>
                                <span class="text-xs font-semibold bg-white/5 px-2 py-1 text-gray-300 rounded-sm">${item.qty} units sold</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Recent Orders -->
                <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm lg:col-span-2">
                    <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-4 mb-4">Recent Sales Activity</h4>
                    <div class="overflow-x-auto dash-scroll">
                        <table class="w-full text-left text-xs min-w-[500px]">
                            <thead>
                                <tr class="text-gray-500 border-b border-white/5 uppercase tracking-wider">
                                    <th class="pb-3 font-semibold">Order</th>
                                    <th class="pb-3 font-semibold">Client</th>
                                    <th class="pb-3 font-semibold">Status</th>
                                    <th class="pb-3 font-semibold">Payment</th>
                                    <th class="pb-3 font-semibold text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${orders.slice(0, 5).map(o => `
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="py-3 font-mono font-bold text-gray-400">#${o.id.substring(0,8)}</td>
                                        <td class="py-3 font-semibold">${o.customer_name}</td>
                                        <td class="py-3">
                                            <span class="px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase tracking-wider 
                                                ${o.order_status === 'delivered' ? 'bg-green-500/10 text-green-400' : ''}
                                                ${o.order_status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' : ''}
                                                ${o.order_status === 'processing' ? 'bg-blue-500/10 text-blue-400' : ''}
                                                ${o.order_status === 'shipped' ? 'bg-indigo-500/10 text-indigo-400' : ''}
                                                ${o.order_status === 'cancelled' ? 'bg-red-500/10 text-red-400' : ''}
                                            ">${o.order_status}</span>
                                        </td>
                                        <td class="py-3 font-semibold uppercase text-gray-400">${o.payment_status}</td>
                                        <td class="py-3 text-right font-bold text-primary-container">$${parseFloat(o.total_amount).toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                                ${orders.length === 0 ? `<tr><td colspan="5" class="py-10 text-center text-gray-500 italic">No checkout records logged yet.</td></tr>` : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ------------------------------------------
// PANEL: PRODUCTS MANAGEMENT (CRUD)
// ------------------------------------------
function renderProducts() {
    const container = document.getElementById('content-area');
    
    container.innerHTML = `
        <div class="space-y-6">
            <!-- Controls bar -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div class="flex items-center gap-3 bg-[#0f0f0f] border border-white/5 px-4 py-2.5 rounded-sm max-w-sm flex-grow">
                    <span class="material-symbols-outlined text-gray-500 text-lg">search</span>
                    <input type="text" id="search-products-input" onkeyup="filterProductsTable()" placeholder="Search artifacts..." class="bg-transparent border-none focus:ring-0 p-0 text-sm text-white placeholder:text-gray-700 w-full"/>
                </div>
                <div class="flex gap-3">
                    <select id="filter-products-status" onchange="filterProductsTable()" class="bg-[#0f0f0f] border border-white/5 rounded-sm text-xs px-3 py-2.5 focus:border-primary focus:ring-0">
                        <option value="all">All Status</option>
                        <option value="active">Active Storefront</option>
                        <option value="draft">Draft Status</option>
                        <option value="archived">Archived</option>
                    </select>
                    <button onclick="openProductForm()" class="bg-primary text-black font-semibold text-xs px-5 py-2.5 rounded-sm hover:bg-white transition-all duration-300 flex items-center gap-1.5 whitespace-nowrap">
                        <span class="material-symbols-outlined text-sm font-semibold">add</span>
                        <span>Add Product</span>
                    </button>
                </div>
            </div>

            <!-- Products List Table -->
            <div class="bg-[#0f0f0f] border border-white/5 rounded-sm overflow-x-auto dash-scroll">
                <table class="w-full text-left text-xs min-w-[800px]">
                    <thead>
                        <tr class="text-gray-500 border-b border-white/5 uppercase tracking-wider">
                            <th class="p-4 font-semibold w-16">Image</th>
                            <th class="p-4 font-semibold">Product Details</th>
                            <th class="p-4 font-semibold">SKU / Slug</th>
                            <th class="p-4 font-semibold">Price</th>
                            <th class="p-4 font-semibold">Vibration Status</th>
                            <th class="p-4 font-semibold text-center">Stock</th>
                            <th class="p-4 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="products-table-body" class="divide-y divide-white/5">
                        <!-- Populated below -->
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Fill product rows
    filterProductsTable();
}

function filterProductsTable() {
    const query = document.getElementById('search-products-input')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('filter-products-status')?.value || 'all';
    const tbody = document.getElementById('products-table-body');
    
    if (!tbody) return;
    
    const filtered = products.filter(p => {
        const matchesQuery = p.name.toLowerCase().includes(query) || (p.sku && p.sku.toLowerCase().includes(query));
        const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchesQuery && matchesStatus;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-gray-500 italic">No artifacts logged matching search filters.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = filtered.map(p => {
        const img = p.images?.[0] || '';
        const isLow = p.inventory_qty < 5;
        
        return `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="p-4">
                    <div class="w-12 h-14 bg-[#080808] border border-white/5 flex items-center justify-center p-1 overflow-hidden">
                        ${img ? `<img src="${img}" class="w-full h-full object-contain"/>` : `<span class="material-symbols-outlined text-gray-700 text-lg">image</span>`}
                    </div>
                </td>
                <td class="p-4">
                    <p class="font-bold text-white text-sm">${p.name}</p>
                    <span class="text-[10px] text-primary-container font-semibold mt-1 block uppercase tracking-wider">${p.category || 'General'}</span>
                </td>
                <td class="p-4 font-mono text-[11px] text-gray-400">
                    <p>SKU: ${p.sku || 'N/A'}</p>
                    <p class="text-gray-600 mt-0.5">/${p.slug}</p>
                </td>
                <td class="p-4 font-bold text-white">
                    <p>$${parseFloat(p.price).toFixed(2)}</p>
                    ${p.compare_at_price ? `<p class="text-gray-500 line-through text-[10px] mt-0.5 font-normal">$${parseFloat(p.compare_at_price).toFixed(2)}</p>` : ''}
                </td>
                <td class="p-4">
                    <span class="px-2 py-0.5 rounded-full font-semibold text-[9px] uppercase tracking-widest
                        ${p.status === 'active' ? 'bg-green-500/10 text-green-400' : ''}
                        ${p.status === 'draft' ? 'bg-yellow-500/10 text-yellow-400' : ''}
                        ${p.status === 'archived' ? 'bg-red-500/10 text-red-400' : ''}
                    ">${p.status}</span>
                </td>
                <td class="p-4 text-center">
                    <span class="font-bold font-mono ${isLow ? 'text-red-400' : 'text-gray-300'}">${p.inventory_qty}</span>
                    ${isLow ? `<span class="block text-[8px] text-red-500 font-semibold tracking-wider mt-0.5">LOW STOCK</span>` : ''}
                </td>
                <td class="p-4 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        <button onclick="editProduct('${p.id}')" class="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/5 transition-all" title="Edit details">
                            <span class="material-symbols-outlined text-base">edit</span>
                        </button>
                        <button onclick="duplicateProduct('${p.id}')" class="p-2 text-gray-400 hover:text-primary rounded-full hover:bg-white/5 transition-all" title="Duplicate details">
                            <span class="material-symbols-outlined text-base">content_copy</span>
                        </button>
                        <button onclick="confirmDeleteProduct('${p.id}', '${p.name}')" class="p-2 text-gray-400 hover:text-red-400 rounded-full hover:bg-white/5 transition-all" title="Remove product">
                            <span class="material-symbols-outlined text-base">delete</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Upload Product Photo logic
async function uploadProductPhoto(input) {
    if (!input.files || input.files.length === 0) return;
    
    const files = Array.from(input.files);
    
    for (const file of files) {
        const ext = file.name.split('.').pop();
        const randName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${ext}`;
        const path = `products/${randName}`;
        
        try {
            // Upload to Supabase Storage
            const { data, error } = await supabaseAdmin.storage
                .from('media')
                .upload(path, file);
                
            if (error) throw error;
            
            // Get public url
            const { data: { publicUrl } } = supabaseAdmin.storage
                .from('media')
                .getPublicUrl(path);
                
            tempUploadedImages.push(publicUrl);
            renderFormImagesList();
            
        } catch (err) {
            console.error("Upload failure:", err);
            alert(`File upload failed: ${err.message}`);
        }
    }
    
    // Clear input
    input.value = '';
}

function renderFormImagesList() {
    const list = document.getElementById('product-images-list');
    if (!list) return;
    
    list.innerHTML = tempUploadedImages.map((img, idx) => `
        <div class="relative w-12 h-14 border border-white/10 bg-black flex items-center justify-center p-0.5">
            <img src="${img}" class="w-full h-full object-contain" />
            <button type="button" onclick="removeFormImage(${idx})" class="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold hover:bg-red-500">×</button>
        </div>
    `).join('');
    
    if (tempUploadedImages.length === 0) {
        list.innerHTML = `<span class="text-[10px] text-gray-600 self-center mx-auto uppercase">No Images Loaded</span>`;
    }
}

window.removeFormImage = function(idx) {
    tempUploadedImages.splice(idx, 1);
    renderFormImagesList();
};

function openProductForm() {
    // Reset Form
    document.getElementById('product-form').reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('product-form-title').innerText = 'Add New Product';
    
    tempUploadedImages = [];
    renderFormImagesList();
    
    const modal = document.getElementById('product-form-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeProductForm() {
    const modal = document.getElementById('product-form-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

window.openProductForm = openProductForm;
window.closeProductForm = closeProductForm;

// Setup Save Submission
document.getElementById('product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('prod-id').value;
    const name = document.getElementById('prod-name').value.trim();
    const slug = document.getElementById('prod-slug').value.trim();
    const sku = document.getElementById('prod-sku').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const comparePriceVal = document.getElementById('prod-compare-price').value;
    const comparePrice = comparePriceVal ? parseFloat(comparePriceVal) : null;
    const discountVal = document.getElementById('prod-discount').value;
    const discount = discountVal ? parseInt(discountVal) : null;
    const stock = parseInt(document.getElementById('prod-stock').value);
    const category = document.getElementById('prod-category').value.trim();
    const colId = document.getElementById('prod-collection').value || null;
    const videoUrl = document.getElementById('prod-video').value.trim() || null;
    const shortDesc = document.getElementById('prod-short-desc').value.trim() || null;
    const desc = document.getElementById('prod-desc').value.trim() || null;
    const status = document.getElementById('prod-status').value;
    
    const tagsVal = document.getElementById('prod-tags').value;
    const tags = tagsVal ? tagsVal.split(',').map(t => t.trim()).filter(Boolean) : [];
    
    const featured = document.getElementById('prod-featured').checked;
    const bestseller = document.getElementById('prod-bestseller').checked;
    
    const payload = {
        name,
        slug,
        sku,
        price,
        compare_at_price: comparePrice,
        discount_percent: discount,
        inventory_qty: stock,
        category,
        collection_id: colId,
        video_url: videoUrl,
        short_description: shortDesc,
        description: desc,
        tags,
        images: tempUploadedImages,
        is_featured: featured,
        is_best_seller: bestseller,
        status,
        updated_at: new Date().toISOString()
    };
    
    try {
        if (id) {
            // Update
            const { error } = await supabaseAdmin
                .from('products')
                .update(payload)
                .eq('id', id);
            if (error) throw error;
        } else {
            // Insert
            const { data: newProd, error } = await supabaseAdmin
                .from('products')
                .insert({ ...payload, created_at: new Date().toISOString() })
                .select();
                
            if (error) throw error;
            
            // Log Initial Stock Entry into History
            if (newProd && newProd[0]) {
                await supabaseAdmin.from('inventory_history').insert({
                    product_id: newProd[0].id,
                    change_qty: stock,
                    reason: 'Initial setup log'
                });
            }
        }
        
        closeProductForm();
        await refreshReferenceData();
        filterProductsTable();
        alert("Product record securely recorded in database.");
        
    } catch (err) {
        console.error("Save failed:", err);
        alert(`Error saving product: ${err.message}`);
    }
});

// Edit Product Load details
function editProduct(prodId) {
    const p = products.find(prod => prod.id === prodId);
    if (!p) return;
    
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-slug').value = p.slug;
    document.getElementById('prod-sku').value = p.sku || '';
    document.getElementById('prod-price').value = p.price;
    document.getElementById('prod-compare-price').value = p.compare_at_price || '';
    document.getElementById('prod-discount').value = p.discount_percent || '';
    document.getElementById('prod-stock').value = p.inventory_qty;
    document.getElementById('prod-category').value = p.category || '';
    document.getElementById('prod-collection').value = p.collection_id || '';
    document.getElementById('prod-video').value = p.video_url || '';
    document.getElementById('prod-short-desc').value = p.short_description || '';
    document.getElementById('prod-desc').value = p.description || '';
    document.getElementById('prod-tags').value = p.tags?.join(', ') || '';
    
    document.getElementById('prod-featured').checked = p.is_featured;
    document.getElementById('prod-bestseller').checked = p.is_best_seller;
    document.getElementById('prod-status').value = p.status;
    
    tempUploadedImages = [...(p.images || [])];
    renderFormImagesList();
    
    document.getElementById('product-form-title').innerText = 'Edit Product';
    
    const modal = document.getElementById('product-form-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Duplicate Product loading
function duplicateProduct(prodId) {
    const p = products.find(prod => prod.id === prodId);
    if (!p) return;
    
    // Fill all form items BUT clear ID, sku, and slug
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-name').value = p.name + " (Copy)";
    document.getElementById('prod-slug').value = p.slug + "-copy";
    document.getElementById('prod-sku').value = '';
    document.getElementById('prod-price').value = p.price;
    document.getElementById('prod-compare-price').value = p.compare_at_price || '';
    document.getElementById('prod-discount').value = p.discount_percent || '';
    document.getElementById('prod-stock').value = p.inventory_qty;
    document.getElementById('prod-category').value = p.category || '';
    document.getElementById('prod-collection').value = p.collection_id || '';
    document.getElementById('prod-video').value = p.video_url || '';
    document.getElementById('prod-short-desc').value = p.short_description || '';
    document.getElementById('prod-desc').value = p.description || '';
    document.getElementById('prod-tags').value = p.tags?.join(', ') || '';
    
    document.getElementById('prod-featured').checked = p.is_featured;
    document.getElementById('prod-bestseller').checked = p.is_best_seller;
    document.getElementById('prod-status').value = 'draft'; // Duplicate defaults to draft
    
    tempUploadedImages = [...(p.images || [])];
    renderFormImagesList();
    
    document.getElementById('product-form-title').innerText = 'Duplicate Product details';
    
    const modal = document.getElementById('product-form-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function confirmDeleteProduct(id, name) {
    openDeleteConfirm(name, async () => {
        try {
            const { error } = await supabaseAdmin
                .from('products')
                .delete()
                .eq('id', id);
            if (error) throw error;
            
            await refreshReferenceData();
            filterProductsTable();
            closeDeleteConfirm();
            alert("Product record has been deleted.");
        } catch (err) {
            console.error("Deletion failure:", err);
            alert(`Error deleting: ${err.message}`);
        }
    });
}

window.editProduct = editProduct;
window.duplicateProduct = duplicateProduct;
window.confirmDeleteProduct = confirmDeleteProduct;
window.uploadProductPhoto = uploadProductPhoto;

// ------------------------------------------
// PANEL: COLLECTIONS MANAGEMENT
// ------------------------------------------
function renderCollections() {
    const container = document.getElementById('content-area');
    
    container.innerHTML = `
        <div class="space-y-6">
            <div class="flex justify-between items-center">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Organize store catalogs into geometrical frequency groups.</p>
                <button onclick="openCollectionForm()" class="bg-primary text-black font-semibold text-xs px-5 py-2.5 rounded-sm hover:bg-white transition-all flex items-center gap-1.5 whitespace-nowrap">
                    <span class="material-symbols-outlined text-sm font-semibold">add</span>
                    <span>Add Collection</span>
                </button>
            </div>

            <!-- List Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${collections.map(c => `
                    <div class="bg-[#0f0f0f] border border-white/5 rounded-sm flex flex-col justify-between overflow-hidden">
                        <div class="h-32 bg-zinc-900 relative">
                            ${c.banner_url ? `<img src="${c.banner_url}" class="w-full h-full object-cover opacity-60"/>` : `<div class="w-full h-full flex items-center justify-center text-gray-700"><span class="material-symbols-outlined text-3xl">image</span></div>`}
                            <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent"></div>
                            <div class="absolute bottom-4 left-4">
                                <h4 class="font-bold text-white text-base leading-none">${c.name}</h4>
                                <span class="text-[10px] text-primary-container tracking-wider font-mono block mt-1">/${c.slug}</span>
                            </div>
                        </div>
                        <div class="p-6 space-y-4">
                            <p class="text-xs text-gray-400 leading-relaxed font-light line-clamp-3">${c.description || 'No description logged'}</p>
                            <div class="flex justify-end gap-2 border-t border-white/5 pt-4">
                                <button onclick="editCollection('${c.id}')" class="bg-[#1b1b1b] border border-white/5 hover:border-primary text-[10px] uppercase tracking-wider font-semibold text-gray-300 px-3 py-1.5 rounded-sm transition-all">Edit</button>
                                <button onclick="confirmDeleteCollection('${c.id}', '${c.name}')" class="bg-[#1b1b1b] border border-white/5 hover:border-red-500 text-[10px] uppercase tracking-wider font-semibold text-red-400 px-3 py-1.5 rounded-sm transition-all">Delete</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
                ${collections.length === 0 ? `<div class="col-span-full py-16 text-center text-gray-500 italic">No collections configured yet.</div>` : ''}
            </div>
        </div>
    `;
}

// Upload Collection Banner file directly to Storage
async function uploadCollectionBanner(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const ext = file.name.split('.').pop();
    const randName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${ext}`;
    const path = `banners/${randName}`;
    
    try {
        const { error } = await supabaseAdmin.storage
            .from('media')
            .upload(path, file);
            
        if (error) throw error;
        
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('media')
            .getPublicUrl(path);
            
        document.getElementById('col-banner-url').value = publicUrl;
        alert("Banner image successfully uploaded.");
    } catch(err) {
        console.error(err);
        alert("Upload error: " + err.message);
    }
}

function openCollectionForm() {
    document.getElementById('collection-form').reset();
    document.getElementById('col-id').value = '';
    document.getElementById('collection-form-title').innerText = 'Create Collection';
    
    const modal = document.getElementById('collection-form-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeCollectionForm() {
    const modal = document.getElementById('collection-form-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

window.openCollectionForm = openCollectionForm;
window.closeCollectionForm = closeCollectionForm;
window.uploadCollectionBanner = uploadCollectionBanner;

// Submit Collection
document.getElementById('collection-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('col-id').value;
    const name = document.getElementById('col-name').value.trim();
    const slug = document.getElementById('col-slug').value.trim();
    const desc = document.getElementById('col-desc').value.trim();
    const banner = document.getElementById('col-banner-url').value.trim() || null;
    
    const payload = { name, slug, description: desc, banner_url: banner };
    
    try {
        if (id) {
            const { error } = await supabaseAdmin.from('collections').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabaseAdmin.from('collections').insert({ ...payload, created_at: new Date().toISOString() });
            if (error) throw error;
        }
        
        closeCollectionForm();
        await refreshReferenceData();
        renderCollections();
        alert("Collection records saved.");
    } catch (err) {
        console.error(err);
        alert("Error saving: " + err.message);
    }
});

function editCollection(colId) {
    const c = collections.find(col => col.id === colId);
    if (!c) return;
    
    document.getElementById('col-id').value = c.id;
    document.getElementById('col-name').value = c.name;
    document.getElementById('col-slug').value = c.slug;
    document.getElementById('col-desc').value = c.description || '';
    document.getElementById('col-banner-url').value = c.banner_url || '';
    
    document.getElementById('collection-form-title').innerText = 'Edit Collection';
    
    const modal = document.getElementById('collection-form-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function confirmDeleteCollection(id, name) {
    openDeleteConfirm(name, async () => {
        try {
            const { error } = await supabaseAdmin.from('collections').delete().eq('id', id);
            if (error) throw error;
            
            await refreshReferenceData();
            renderCollections();
            closeDeleteConfirm();
            alert("Collection record deleted.");
        } catch(err) {
            console.error(err);
            alert("Delete error: " + err.message);
        }
    });
}

window.editCollection = editCollection;
window.confirmDeleteCollection = confirmDeleteCollection;


// ------------------------------------------
// PANEL: INVENTORY MANAGEMENT
// ------------------------------------------
async function loadInventoryData() {
    const { data: hist } = await supabaseAdmin
        .from('inventory_history')
        .select(`
            id,
            change_qty,
            reason,
            created_at,
            product_id,
            products ( name )
        `)
        .order('created_at', { ascending: false });
        
    inventoryHistory = hist || [];
    
    const { data: prod } = await supabaseAdmin.from('products').select('*').order('name');
    products = prod || [];
}

function renderInventory() {
    const container = document.getElementById('content-area');
    
    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Inventory adjustments list -->
            <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm lg:col-span-2">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-4 mb-4">Stock Levels Dashboard</h4>
                <div class="overflow-x-auto dash-scroll">
                    <table class="w-full text-left text-xs min-w-[500px]">
                        <thead>
                            <tr class="text-gray-500 border-b border-white/5 uppercase tracking-wider">
                                <th class="pb-3 font-semibold">Artifact</th>
                                <th class="pb-3 font-semibold">Vibration</th>
                                <th class="pb-3 font-semibold text-center">Remaining</th>
                                <th class="pb-3 font-semibold text-right">Quick Refill</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${products.map(p => {
                                const isLow = p.inventory_qty < 5;
                                return `
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="py-4">
                                            <p class="font-bold text-white">${p.name}</p>
                                            <span class="text-[9px] text-gray-500 block mt-0.5">${p.sku || 'No SKU'}</span>
                                        </td>
                                        <td class="py-4 font-semibold uppercase text-gray-400">${p.status}</td>
                                        <td class="py-4 text-center">
                                            <span id="stock-val-${p.id}" class="font-bold font-mono text-sm ${isLow ? 'text-red-400' : 'text-gray-300'}">${p.inventory_qty}</span>
                                            ${isLow ? `<span class="block text-[8px] text-red-500 font-bold tracking-widest mt-0.5">LOW STOCK</span>` : ''}
                                        </td>
                                        <td class="py-4 text-right">
                                            <div class="flex items-center justify-end gap-2">
                                                <input type="number" id="stock-input-${p.id}" placeholder="Change" class="w-16 bg-black border border-white/10 rounded-sm text-xs text-white px-2 py-1 text-center focus:ring-0 focus:border-primary"/>
                                                <button onclick="quickUpdateStock('${p.id}')" class="bg-primary hover:bg-white text-black font-semibold text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded-sm transition-all">Log</button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- History log -->
            <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm lg:col-span-1">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-4 mb-4">Inventory Movement History</h4>
                <div class="space-y-4 max-h-[500px] overflow-y-auto dash-scroll pr-1">
                    ${inventoryHistory.map(h => `
                        <div class="border-b border-white/5 pb-3">
                            <div class="flex justify-between items-start">
                                <h5 class="text-xs font-bold text-white truncate max-w-[150px]">${h.products?.name || 'Deleted Product'}</h5>
                                <span class="font-mono text-xs font-bold ${h.change_qty > 0 ? 'text-green-400' : 'text-red-400'}">${h.change_qty > 0 ? '+' : ''}${h.change_qty}</span>
                            </div>
                            <p class="text-[10px] text-gray-400 mt-1 leading-relaxed">${h.reason}</p>
                            <span class="text-[8px] text-gray-500 block mt-1">${new Date(h.created_at).toLocaleString()}</span>
                        </div>
                    `).join('')}
                    ${inventoryHistory.length === 0 ? `<p class="text-xs text-gray-500 italic py-6 text-center">No inventory history logs available.</p>` : ''}
                </div>
            </div>
        </div>
    `;
}

async function quickUpdateStock(prodId) {
    const input = document.getElementById(`stock-input-${prodId}`);
    if (!input) return;
    
    const delta = parseInt(input.value);
    if (isNaN(delta) || delta === 0) {
        alert("Please enter a valid stock deviation integer (e.g. +10, -5).");
        return;
    }
    
    const p = products.find(prod => prod.id === prodId);
    if (!p) return;
    
    const newQty = Math.max(0, p.inventory_qty + delta);
    
    try {
        // Update product
        const { error: prodErr } = await supabaseAdmin
            .from('products')
            .update({ inventory_qty: newQty })
            .eq('id', prodId);
            
        if (prodErr) throw prodErr;
        
        // Log entry
        const { error: logErr } = await supabaseAdmin
            .from('inventory_history')
            .insert({
                product_id: prodId,
                change_qty: delta,
                reason: `Console Adjustment: Manual stock change`
            });
            
        if (logErr) throw logErr;
        
        alert("Stock level modified successfully.");
        await loadInventoryData();
        renderInventory();
    } catch(err) {
        console.error(err);
        alert("Failed to modify stock: " + err.message);
    }
}

window.quickUpdateStock = quickUpdateStock;


// ------------------------------------------
// PANEL: ORDERS Log
// ------------------------------------------
async function loadOrdersData() {
    const { data: ord } = await supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false });
    orders = ord || [];
}

function renderOrders() {
    const container = document.getElementById('content-area');
    
    container.innerHTML = `
        <div class="bg-[#0f0f0f] border border-white/5 rounded-sm p-6 overflow-x-auto dash-scroll">
            <table class="w-full text-left text-xs min-w-[700px]">
                <thead>
                    <tr class="text-gray-500 border-b border-white/5 uppercase tracking-wider">
                        <th class="pb-4 font-semibold">Order ID</th>
                        <th class="pb-4 font-semibold">Purchaser Name</th>
                        <th class="pb-4 font-semibold">Date Registered</th>
                        <th class="pb-4 font-semibold">Items</th>
                        <th class="pb-4 font-semibold">Transaction</th>
                        <th class="pb-4 font-semibold text-center">Fulfillment</th>
                        <th class="pb-4 font-semibold text-right">Invoice</th>
                        <th class="pb-4 font-semibold text-right">View</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                    ${orders.map(o => `
                        <tr class="hover:bg-white/5 transition-colors">
                            <td class="py-4 font-mono font-bold text-gray-400">#${o.id.substring(0,8)}</td>
                            <td class="py-4">
                                <p class="font-semibold text-white">${o.customer_name}</p>
                                <span class="text-[9px] text-gray-500 block mt-0.5">${o.customer_email}</span>
                            </td>
                            <td class="py-4 text-gray-400">${new Date(o.created_at).toLocaleDateString()}</td>
                            <td class="py-4 font-semibold">${o.items?.length || 0} beads</td>
                            <td class="py-4 uppercase text-gray-400 font-medium">${o.payment_status}</td>
                            <td class="py-4 text-center">
                                <span class="px-2.5 py-0.5 rounded-full font-semibold text-[8px] uppercase tracking-widest
                                    ${o.order_status === 'delivered' ? 'bg-green-500/10 text-green-400' : ''}
                                    ${o.order_status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' : ''}
                                    ${o.order_status === 'processing' ? 'bg-blue-500/10 text-blue-400' : ''}
                                    ${o.order_status === 'shipped' ? 'bg-indigo-500/10 text-indigo-400' : ''}
                                    ${o.order_status === 'cancelled' ? 'bg-red-500/10 text-red-400' : ''}
                                ">${o.order_status}</span>
                            </td>
                            <td class="py-4 text-right font-bold text-primary-container">$${parseFloat(o.total_amount).toFixed(2)}</td>
                            <td class="py-4 text-right">
                                <button onclick="viewOrderDetail('${o.id}')" class="bg-[#1b1b1b] border border-white/5 hover:border-white text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-sm transition-all">Details</button>
                            </td>
                        </tr>
                    `).join('')}
                    ${orders.length === 0 ? `<tr><td colspan="8" class="py-16 text-center text-gray-500 italic">No purchase transactions logged yet.</td></tr>` : ''}
                </tbody>
            </table>
        </div>
    `;
}

let activeOrderInModal = null;

function viewOrderDetail(orderId) {
    const o = orders.find(ord => ord.id === orderId);
    if (!o) return;
    
    activeOrderInModal = o;
    
    document.getElementById('order-modal-id').innerText = `ID: #${o.id}`;
    document.getElementById('order-cust-name').innerText = o.customer_name;
    document.getElementById('order-cust-email').innerText = o.customer_email;
    document.getElementById('order-cust-phone').innerText = o.customer_phone || 'None provided';
    document.getElementById('order-cust-address').innerText = o.customer_address;
    
    document.getElementById('order-pay-status').value = o.payment_status;
    document.getElementById('order-ship-status').value = o.order_status;
    
    document.getElementById('order-total-price').innerText = `$${parseFloat(o.total_amount).toFixed(2)}`;
    
    const itemsContainer = document.getElementById('order-items-list');
    if (itemsContainer) {
        itemsContainer.innerHTML = o.items.map(it => `
            <div class="flex justify-between items-center bg-[#0d0d0d] p-3 border border-white/5 text-xs">
                <div>
                    <h5 class="font-bold text-white">${it.name}</h5>
                    <p class="text-gray-500 mt-1">Price: $${it.price} | Qty: ${it.qty}</p>
                </div>
                <span class="font-bold text-white">$${(it.price * it.qty).toFixed(2)}</span>
            </div>
        `).join('');
    }
    
    const modal = document.getElementById('order-detail-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeOrderDetail() {
    const modal = document.getElementById('order-detail-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function updateOrderDetails() {
    if (!activeOrderInModal) return;
    
    const pay = document.getElementById('order-pay-status').value;
    const ship = document.getElementById('order-ship-status').value;
    
    try {
        const { error } = await supabaseAdmin
            .from('orders')
            .update({
                payment_status: pay,
                order_status: ship
            })
            .eq('id', activeOrderInModal.id);
            
        if (error) throw error;
        
        // Re-load list
        await loadOrdersData();
        renderOrders();
        
    } catch(err) {
        console.error(err);
        alert("Failed to modify order values: " + err.message);
    }
}

window.viewOrderDetail = viewOrderDetail;
window.closeOrderDetail = closeOrderDetail;
window.updateOrderDetails = updateOrderDetails;


// ------------------------------------------
// PANEL: MEDIA LIBRARY
// ------------------------------------------
async function loadMediaData() {
    try {
        const { data, error } = await supabaseAdmin.storage
            .from('media')
            .list('products', {
                limit: 100,
                sortBy: { column: 'name', order: 'asc' }
            });
            
        if (error) throw error;
        
        // Build list of items
        mediaList = (data || []).map(file => {
            const { data: { publicUrl } } = supabaseAdmin.storage
                .from('media')
                .getPublicUrl(`products/${file.name}`);
                
            return {
                name: file.name,
                url: publicUrl,
                size: file.metadata?.size || 0,
                created_at: file.created_at
            };
        });
    } catch (err) {
        console.warn("Storage listing failure:", err.message);
        mediaList = [];
    }
}

function renderMedia() {
    const container = document.getElementById('content-area');
    
    container.innerHTML = `
        <div class="space-y-6">
            <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/5 pb-6">
                <div>
                    <input id="media-upload-input" type="file" multiple accept="image/*" class="hidden" onchange="uploadLibraryMedia(this)" />
                    <button onclick="document.getElementById('media-upload-input').click()" class="bg-primary text-black font-semibold text-xs px-5 py-2.5 rounded-sm hover:bg-white transition-all flex items-center gap-1.5 whitespace-nowrap">
                        <span class="material-symbols-outlined text-sm">cloud_upload</span>
                        <span>Upload Media files</span>
                    </button>
                </div>
                <div class="flex items-center gap-2 bg-[#0f0f0f] border border-white/5 px-4 py-2.5 rounded-sm max-w-sm flex-grow">
                    <span class="material-symbols-outlined text-gray-500 text-base">search</span>
                    <input type="text" id="search-media" onkeyup="filterMediaDisplay()" placeholder="Search assets..." class="bg-transparent border-none focus:ring-0 p-0 text-xs text-white placeholder:text-gray-700 w-full"/>
                </div>
            </div>

            <!-- Media files grid -->
            <div id="media-grid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                <!-- Loaded dynamically -->
            </div>
        </div>
    `;
    
    filterMediaDisplay();
}

function filterMediaDisplay() {
    const query = document.getElementById('search-media')?.value?.toLowerCase() || '';
    const grid = document.getElementById('media-grid');
    if (!grid) return;
    
    const filtered = mediaList.filter(m => m.name.toLowerCase().includes(query));
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-16 text-center text-gray-500 italic">No media assets found in products/ directory.</div>`;
        return;
    }
    
    grid.innerHTML = filtered.map(m => `
        <div class="bg-[#0f0f0f] border border-white/5 rounded-sm p-3 group relative flex flex-col justify-between items-center text-center">
            <div class="w-full aspect-square bg-zinc-950 flex items-center justify-center p-1 overflow-hidden mb-3">
                <img src="${m.url}" class="w-full h-full object-contain hover:scale-105 transition-transform duration-300"/>
            </div>
            <p class="text-[10px] font-mono text-gray-400 truncate w-full" title="${m.name}">${m.name}</p>
            <span class="text-[8px] text-gray-600 font-semibold block mt-1">${(m.size / 1024).toFixed(1)} KB</span>
            
            <!-- Hover actions card -->
            <div class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity p-2">
                <button onclick="copyMediaUrl('${m.url}')" class="w-full bg-[#1b1b1b] border border-white/5 hover:border-white py-1.5 text-[8px] uppercase tracking-widest font-bold text-white transition-all rounded-sm flex items-center justify-center gap-1">
                    <span class="material-symbols-outlined text-xs">link</span>
                    <span>Copy URL</span>
                </button>
                <button onclick="confirmDeleteMedia('${m.name}')" class="w-full bg-red-900/50 border border-red-500/20 hover:bg-red-600 hover:border-white py-1.5 text-[8px] uppercase tracking-widest font-bold text-white transition-all rounded-sm flex items-center justify-center gap-1">
                    <span class="material-symbols-outlined text-xs">delete</span>
                    <span>Delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

function copyMediaUrl(url) {
    navigator.clipboard.writeText(url);
    alert("Public asset URL copied to clipboard.");
}

async function uploadLibraryMedia(input) {
    if (!input.files || input.files.length === 0) return;
    const files = Array.from(input.files);
    
    for (const file of files) {
        const ext = file.name.split('.').pop();
        const randName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${ext}`;
        const path = `products/${randName}`;
        
        try {
            const { error } = await supabaseAdmin.storage
                .from('media')
                .upload(path, file);
                
            if (error) throw error;
        } catch(err) {
            console.error(err);
            alert(`File upload error: ${err.message}`);
        }
    }
    
    input.value = '';
    alert("Upload processes resolved.");
    await loadMediaData();
    renderMedia();
}

function confirmDeleteMedia(filename) {
    openDeleteConfirm(filename, async () => {
        try {
            const { error } = await supabaseAdmin.storage
                .from('media')
                .remove([`products/${filename}`]);
                
            if (error) throw error;
            
            await loadMediaData();
            renderMedia();
            closeDeleteConfirm();
            alert("Media asset deleted.");
        } catch(err) {
            console.error(err);
            alert("Deletion failed: " + err.message);
        }
    });
}

window.copyMediaUrl = copyMediaUrl;
window.uploadLibraryMedia = uploadLibraryMedia;
window.confirmDeleteMedia = confirmDeleteMedia;
window.filterMediaDisplay = filterMediaDisplay;


// ------------------------------------------
// PANEL: HOMEPAGE SECTIONS CMS
// ------------------------------------------
async function loadHomepageData() {
    const { data } = await supabaseAdmin.from('homepage_settings').select('*');
    
    homepageSettings = {};
    if (data) {
        data.forEach(item => {
            homepageSettings[item.key] = item.value;
        });
    }
}

function renderHomepageCMS() {
    const container = document.getElementById('content-area');
    
    // Testimonials schema load
    const testimonialsList = homepageSettings.testimonials || [];
    
    // Promotions schema
    const promo = homepageSettings.promotions || { active: false, text: '', link: '' };
    
    // Hero schema
    const hero = homepageSettings.hero || { subtitle: '', title: '', description: '', button_text: '', button_link: '' };
    
    // Brand Story schema
    const story = homepageSettings.brand_story || { title: '', image_url: '', text_1: '', text_2: '', button_text: '', button_link: '' };

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            <!-- Hero settings -->
            <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm space-y-4">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-4">Hero Banner Content</h4>
                <div class="space-y-3">
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Subtitle</label>
                        <input id="hp-hero-sub" type="text" value="${hero.subtitle || ''}" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white"/>
                    </div>
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Title</label>
                        <input id="hp-hero-title" type="text" value="${hero.title || ''}" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white"/>
                    </div>
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Description</label>
                        <textarea id="hp-hero-desc" rows="2" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white">${hero.description || ''}</textarea>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Button text</label>
                            <input id="hp-hero-btn" type="text" value="${hero.button_text || ''}" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white"/>
                        </div>
                        <div>
                            <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Button link</label>
                            <input id="hp-hero-link" type="text" value="${hero.button_link || ''}" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white"/>
                        </div>
                    </div>
                    <button onclick="saveHomepageSection('hero')" class="bg-primary text-black font-semibold text-[10px] uppercase tracking-widest px-4 py-2 hover:bg-white transition-all rounded-sm">Save Hero</button>
                </div>
            </div>

            <!-- Promotion Banner -->
            <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm space-y-4">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-4">Top Promotional Banner</h4>
                <div class="space-y-3">
                    <label class="flex items-center gap-2 cursor-pointer mb-2">
                        <input id="hp-promo-active" type="checkbox" ${promo.active ? 'checked' : ''} class="bg-black border-white/10 rounded-sm text-primary focus:ring-0 w-4 h-4"/>
                        <span class="text-[10px] text-gray-300 font-bold uppercase tracking-wider">Show Promotional Banner</span>
                    </label>
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Promo Banner text</label>
                        <input id="hp-promo-text" type="text" value="${promo.text || ''}" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white"/>
                    </div>
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Link URL path</label>
                        <input id="hp-promo-link" type="text" value="${promo.link || ''}" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white"/>
                    </div>
                    <button onclick="saveHomepageSection('promotions')" class="bg-primary text-black font-semibold text-[10px] uppercase tracking-widest px-4 py-2 hover:bg-white transition-all rounded-sm">Save Promo</button>
                </div>
            </div>

            <!-- Brand story settings -->
            <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm space-y-4">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-4">Brand Story / Philosophy</h4>
                <div class="space-y-3">
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Section Title</label>
                        <input id="hp-story-title" type="text" value="${story.title || ''}" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white"/>
                    </div>
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Philosophy Image URL</label>
                        <input id="hp-story-img" type="text" value="${story.image_url || ''}" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white"/>
                    </div>
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Philosophy Paragraph 1</label>
                        <textarea id="hp-story-t1" rows="3" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white">${story.text_1 || ''}</textarea>
                    </div>
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">Philosophy Paragraph 2</label>
                        <textarea id="hp-story-t2" rows="3" class="w-full bg-black border border-white/10 rounded-sm text-xs px-3 py-2 focus:border-primary focus:ring-0 text-white">${story.text_2 || ''}</textarea>
                    </div>
                    <button onclick="saveHomepageSection('brand_story')" class="bg-primary text-black font-semibold text-[10px] uppercase tracking-widest px-4 py-2 hover:bg-white transition-all rounded-sm">Save Brand Story</button>
                </div>
            </div>

            <!-- Testimonials CMS list -->
            <div class="bg-[#0f0f0f] border border-white/5 p-6 rounded-sm space-y-4">
                <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-4">Testimonials Reviews List</h4>
                <div class="space-y-4 max-h-[400px] overflow-y-auto pr-1 dash-scroll" id="testimonials-cms-container">
                    <!-- Testimonial elements list -->
                </div>
                <button onclick="addTestimonialInput()" class="w-full border border-dashed border-white/20 hover:border-primary text-[10px] uppercase tracking-widest font-bold text-gray-400 hover:text-white py-3 transition-all rounded-sm">Add New Review</button>
                <button onclick="saveHomepageSection('testimonials')" class="bg-primary text-black font-semibold text-[10px] uppercase tracking-widest px-4 py-2 hover:bg-white transition-all rounded-sm">Save Testimonials</button>
            </div>

        </div>
    `;
    
    renderTestimonialInputs();
}

function renderTestimonialInputs() {
    const list = homepageSettings.testimonials || [];
    const container = document.getElementById('testimonials-cms-container');
    if (!container) return;
    
    container.innerHTML = list.map((item, idx) => `
        <div class="bg-black/40 p-4 border border-white/5 space-y-3 relative">
            <button onclick="removeTestimonialInput(${idx})" class="absolute top-2 right-2 text-red-500 hover:text-red-400 font-bold text-xs" title="Remove review">Remove</button>
            
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Seeker Name</label>
                    <input type="text" value="${item.name || ''}" onchange="updateTestimonialValue(${idx}, 'name', this.value)" class="w-full bg-black border border-white/10 rounded-sm text-[11px] px-2 py-1 text-white focus:ring-0 focus:border-primary"/>
                </div>
                <div>
                    <label class="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Seeker Role</label>
                    <input type="text" value="${item.role || ''}" onchange="updateTestimonialValue(${idx}, 'role', this.value)" class="w-full bg-black border border-white/10 rounded-sm text-[11px] px-2 py-1 text-white focus:ring-0 focus:border-primary"/>
                </div>
            </div>
            <div>
                <label class="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Avatar Image URL (Optional)</label>
                <input type="text" value="${item.avatar_url || ''}" onchange="updateTestimonialValue(${idx}, 'avatar_url', this.value)" class="w-full bg-black border border-white/10 rounded-sm text-[11px] px-2 py-1 text-white focus:ring-0 focus:border-primary"/>
            </div>
            <div>
                <label class="block text-[8px] text-gray-600 uppercase tracking-widest mb-1">Sacred Quote / Feedback</label>
                <textarea rows="2" onchange="updateTestimonialValue(${idx}, 'quote', this.value)" class="w-full bg-black border border-white/10 rounded-sm text-[11px] px-2 py-1 text-white focus:ring-0 focus:border-primary">${item.quote || ''}</textarea>
            </div>
        </div>
    `).join('');
    
    if (list.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-600 italic py-4 text-center">No reviews mapped yet.</p>`;
    }
}

window.updateTestimonialValue = function(idx, field, value) {
    if (!homepageSettings.testimonials) homepageSettings.testimonials = [];
    if (homepageSettings.testimonials[idx]) {
        homepageSettings.testimonials[idx][field] = value;
    }
};

window.addTestimonialInput = function() {
    if (!homepageSettings.testimonials) homepageSettings.testimonials = [];
    homepageSettings.testimonials.push({ name: '', role: '', quote: '', avatar_url: '' });
    renderTestimonialInputs();
};

window.removeTestimonialInput = function(idx) {
    if (!homepageSettings.testimonials) return;
    homepageSettings.testimonials.splice(idx, 1);
    renderTestimonialInputs();
};

async function saveHomepageSection(key) {
    let value = {};
    
    if (key === 'hero') {
        value = {
            subtitle: document.getElementById('hp-hero-sub').value.trim(),
            title: document.getElementById('hp-hero-title').value.trim(),
            description: document.getElementById('hp-hero-desc').value.trim(),
            button_text: document.getElementById('hp-hero-btn').value.trim(),
            button_link: document.getElementById('hp-hero-link').value.trim()
        };
    } else if (key === 'promotions') {
        value = {
            active: document.getElementById('hp-promo-active').checked,
            text: document.getElementById('hp-promo-text').value.trim(),
            link: document.getElementById('hp-promo-link').value.trim()
        };
    } else if (key === 'brand_story') {
        value = {
            title: document.getElementById('hp-story-title').value.trim(),
            image_url: document.getElementById('hp-story-img').value.trim(),
            text_1: document.getElementById('hp-story-t1').value.trim(),
            text_2: document.getElementById('hp-story-t2').value.trim(),
        };
    } else if (key === 'testimonials') {
        value = homepageSettings.testimonials || [];
    }
    
    try {
        const { error } = await supabaseAdmin
            .from('homepage_settings')
            .upsert({
                key,
                value,
                updated_at: new Date().toISOString()
            });
            
        if (error) throw error;
        alert(`Homepage settings for '${key}' successfully updated.`);
        await loadHomepageData();
        renderHomepageCMS();
    } catch(err) {
        console.error(err);
        alert("Failed to update section: " + err.message);
    }
}

window.saveHomepageSection = saveHomepageSection;


// ------------------------------------------
// SHARED DIALOG CONTROLLERS
// ------------------------------------------
function openDeleteConfirm(itemName, onConfirmCallback) {
    document.getElementById('delete-item-name').innerText = itemName;
    
    const confirmBtn = document.getElementById('delete-confirm-btn');
    
    // Reset click listener by cloning
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', onConfirmCallback);
    
    const modal = document.getElementById('delete-confirm-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeDeleteConfirm() {
    const modal = document.getElementById('delete-confirm-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

window.closeDeleteConfirm = closeDeleteConfirm;


// Launch App on DOM Load
window.addEventListener('DOMContentLoaded', initAdminPanel);
