/* ==========================================================================
   HD RACING - FRONTEND APPLICATION
   MOTOS · ACCESORIOS · INDUMENTARIA
   ========================================================================== */

/* Supabase Configuration (Multi-tenant ready) */
const supabaseUrl = "https://wkgxssfbzgahkztdjzmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrZ3hzc2ZiemdhaGt6dGRqem1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzI4MjcsImV4cCI6MjA5NjA0ODgyN30.BNlE6dOMlbMlERR7ri4c4QIKqVXCJPHcZviTNunku44";
let supabaseClient = null;

if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

/* ==========================================================================
   GLOBAL STATE
   ========================================================================== */
const state = {
    products: [],
    categories: [],
    settings: {
        storeName: 'HD RACING',
        storeSlogan: 'MOTOS | ACCESORIOS | INDUMENTARIA',
        currency: '$',
        whatsapp: '+5493795331132',
        storeAlias: 'HDRACING.OFICIAL',
        storeHolder: 'HD RACING S.R.L.',
        storeAddress: 'Av. Independencia 3420, Corrientes Capital, Argentina',
        storePhone: '+54 9 379 533-1132'
    },
    cart: [],
    paymentMethod: 'cash' // 'cash' or 'qr'
};

let activeCategory = '';
let fuseInstance = null;
let modalCurrentProduct = null;
let modalSelectedQty = 1;

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Dynamic Store Status (Open / Closed)
    updateStoreStatus();
    setInterval(updateStoreStatus, 60000);

    // Restore Cart from session storage
    loadCartFromSession();

    // Fetch Catalog Data
    fetchCatalog();
});

/* ==========================================================================
   STORE STATUS (BUSINESS HOURS)
   ========================================================================== */
function updateStoreStatus() {
    const statusPill = document.querySelector('.store-status-pill');
    if (!statusPill) return;

    const statusText = statusPill.querySelector('.status-text');
    const now = new Date();
    const day = now.getDay(); // 0 is Sunday
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeVal = hour + (minute / 60);

    // Open Mon-Sat: 08:30 to 13:00 and 16:30 to 20:30
    const isWeekdayOrSat = day >= 1 && day <= 6;
    const isMorningShift = timeVal >= 8.5 && timeVal < 13.0;
    const isEveningShift = timeVal >= 16.5 && timeVal < 20.5;
    const isOpen = isWeekdayOrSat && (isMorningShift || isEveningShift);

    if (isOpen) {
        statusPill.classList.remove('closed');
        if (statusText) statusText.textContent = 'Abierto';
    } else {
        statusPill.classList.add('closed');
        if (statusText) statusText.textContent = 'Cerrado';
    }
}

/* ==========================================================================
   DATA FETCHING (SUPABASE RPC WITH LOCAL JSON FALLBACK)
   ========================================================================== */
async function fetchCatalog() {
    const urlParams = new URLSearchParams(window.location.search);
    const storeId = urlParams.get('store');

    // If an explicit store ID is passed and supabase is available, try Supabase RPC
    if (storeId && supabaseClient) {
        try {
            console.log(`Intentando conectar con Supabase para tienda: ${storeId}`);
            const { data: catalogData, error } = await supabaseClient.rpc('get_public_catalog', {
                target_store_id: storeId
            });

            if (!error && catalogData && catalogData.products) {
                console.log("Catálogo cargado con éxito desde Supabase:", catalogData);
                populateCatalogData(catalogData);
                return;
            }
        } catch (err) {
            console.warn("Fallo RPC Supabase, usando catálogo local de respaldo:", err);
        }
    }

    // Default: Load local catalog for HD Racing
    await fetchLocalFallback();
}

async function fetchLocalFallback() {
    try {
        const response = await fetch('hdracing_db.json?v=' + Date.now());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log("Catálogo local cargado correctamente:", data);
        populateCatalogData(data);
    } catch (err) {
        console.error("Error cargando base de datos local:", err);
        const grid = document.getElementById('products-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="grid-loading" style="color: var(--race-red);">
                    <i data-lucide="alert-triangle" style="width: 48px; height: 48px; margin: 0 auto 12px; display: block;"></i>
                    <p style="font-size: 16px; font-weight: 700;">No se pudo cargar el catálogo de productos.</p>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-top: 6px;">Por favor, reintentá recargar la página o consultanos directamente por WhatsApp.</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }
}

function populateCatalogData(data) {
    state.products = data.products || [];
    state.categories = data.categories || [];
    if (data.settings) {
        state.settings = { ...state.settings, ...data.settings };
    }

    // Apply settings to DOM elements
    applySettingsToUI();

    // Render category filters
    renderCategoryTabs();

    // Initialize Fuse.js for smart search
    if (window.Fuse) {
        fuseInstance = new Fuse(state.products, {
            keys: [
                { name: 'name', weight: 0.5 },
                { name: 'sku', weight: 0.3 },
                { name: 'category', weight: 0.2 },
                { name: 'description', weight: 0.1 }
            ],
            threshold: 0.35,
            ignoreLocation: true
        });
    }

    // Render initial product cards
    renderCatalog();
    updateCartUI();
}

function applySettingsToUI() {
    const s = state.settings;
    if (s.storeAddress) {
        const addrEl = document.getElementById('footer-address');
        if (addrEl) addrEl.textContent = s.storeAddress;
    }
    if (s.storePhone) {
        const phoneEl = document.getElementById('footer-phone');
        if (phoneEl) phoneEl.textContent = s.storePhone;
    }
    if (s.openingHours) {
        const hoursEl = document.getElementById('footer-hours');
        if (hoursEl) hoursEl.textContent = s.openingHours;
    }
    if (s.whatsapp) {
        const waLink = document.getElementById('footer-whatsapp-link');
        if (waLink) {
            const cleanNum = s.whatsapp.replace(/[^0-9]/g, '');
            waLink.href = `https://wa.me/${cleanNum}`;
        }
    }
    if (s.instagram) {
        const igLink = document.getElementById('footer-instagram-link');
        if (igLink) igLink.href = s.instagram;
    }
    if (s.storeHolder) {
        const holderEl = document.getElementById('modal-display-holder');
        if (holderEl) holderEl.textContent = s.storeHolder;
    }
    if (s.storeAlias) {
        const aliasEl = document.getElementById('modal-display-alias');
        if (aliasEl) aliasEl.textContent = s.storeAlias;
    }
}

/* ==========================================================================
   CATEGORY TABS RENDERING
   ========================================================================== */
function renderCategoryTabs() {
    const tabsContainer = document.getElementById('category-tabs');
    if (!tabsContainer) return;

    // Build unique categories list
    const categoriesSet = new Set(state.categories);
    state.products.forEach(p => {
        if (p.category) categoriesSet.add(p.category);
    });

    const categoriesList = Array.from(categoriesSet);

    let html = `
        <button class="category-tab-btn active" onclick="setCategory('', this)">
            <i data-lucide="layout-grid" style="width: 14px; height: 14px;"></i>
            <span>Todos (${state.products.length})</span>
        </button>
    `;

    categoriesList.forEach(cat => {
        const count = state.products.filter(p => p.category === cat).length;
        html += `
            <button class="category-tab-btn" onclick="setCategory('${escapeAttr(cat)}', this)">
                <span>${cat}</span>
                <span style="opacity: 0.6; font-size: 11.5px;">(${count})</span>
            </button>
        `;
    });

    tabsContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

window.setCategory = function(cat, btnElement) {
    activeCategory = cat;

    // Update active tab button style
    document.querySelectorAll('.category-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (btnElement) {
        btnElement.classList.add('active');
    }

    filterCatalog();
};

/* ==========================================================================
   CATALOG FILTERING & SMART SEARCH
   ========================================================================== */
window.filterCatalog = function() {
    const searchInput = document.getElementById('catalog-search');
    const query = searchInput ? searchInput.value.trim() : '';
    const stockOnly = document.getElementById('filter-stock') ? document.getElementById('filter-stock').checked : false;

    // Toggle clear search button
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) {
        clearBtn.style.display = query.length > 0 ? 'flex' : 'none';
    }

    let results = state.products;

    // 1. Filter by category
    if (activeCategory) {
        results = results.filter(p => p.category === activeCategory);
    }

    // 2. Filter by search query (using Fuse.js if available)
    if (query.length > 0) {
        if (fuseInstance) {
            const fuseResults = fuseInstance.search(query);
            const matchedIds = new Set(fuseResults.map(r => r.item.id));
            results = results.filter(p => matchedIds.has(p.id));
        } else {
            const q = query.toLowerCase();
            results = results.filter(p => 
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.sku && p.sku.toLowerCase().includes(q)) ||
                (p.category && p.category.toLowerCase().includes(q))
            );
        }
    }

    // 3. Filter by stock availability
    if (stockOnly) {
        results = results.filter(p => p.stock > 0);
    }

    // Update counter
    const counterEl = document.getElementById('products-counter');
    if (counterEl) {
        counterEl.textContent = `Mostrando ${results.length} de ${state.products.length} productos`;
    }

    renderCatalog(results);
};

window.clearSearch = function() {
    const searchInput = document.getElementById('catalog-search');
    if (searchInput) {
        searchInput.value = '';
        filterCatalog();
        searchInput.focus();
    }
};

/* ==========================================================================
   RENDER CATALOG GRID
   ========================================================================== */
function renderCatalog(itemsToRender = null) {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    const products = itemsToRender !== null ? itemsToRender : state.products;

    if (products.length === 0) {
        grid.innerHTML = `
            <div class="grid-loading">
                <i data-lucide="package-search" style="width: 48px; height: 48px; margin: 0 auto 12px; display: block; color: var(--text-muted);"></i>
                <p style="font-size: 16px; font-weight: 700; color: #ffffff;">No encontramos productos con ese criterio</p>
                <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Probá modificando la búsqueda o quitando los filtros de categoría.</p>
                <button class="btn btn-secondary" style="margin-top: 16px;" onclick="resetAllFilters()">Restablecer filtros</button>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    const currency = state.settings.currency || '$';

    grid.innerHTML = products.map(product => {
        const isOutOfStock = product.stock <= 0;
        const isLowStock = product.stock > 0 && product.stock <= 3;

        let badgeClass = 'in-stock';
        let badgeText = 'En Stock';

        if (isOutOfStock) {
            badgeClass = 'out-of-stock';
            badgeText = 'Sin Stock';
        } else if (isLowStock) {
            badgeClass = 'low-stock';
            badgeText = `Últimas ${product.stock} u.`;
        }

        const wholesalePrice = parseFloat(product.priceWholesale !== undefined ? product.priceWholesale : product.priceDiscount) || 0;
        const hasWholesale = wholesalePrice > 0 && wholesalePrice < product.price;

        return `
            <div class="product-card ${isOutOfStock ? 'is-out-of-stock' : ''}" onclick="openProductModal('${product.id}')">
                <div class="card-top">
                    <span class="card-badge-stock ${badgeClass}">${badgeText}</span>
                    ${product.image ? `
                        <img src="${product.image}" alt="${escapeAttr(product.name)}" class="product-card-img" loading="lazy" onerror="handleImageError(this, '${escapeAttr(product.category)}')">
                    ` : getCategoryPlaceholder(product.category)}
                </div>

                <div class="card-content">
                    <div class="card-meta-row">
                        <span class="card-category-tag">${product.category || 'General'}</span>
                        <span class="card-sku">${product.sku || ''}</span>
                    </div>

                    <h3 class="card-product-title" title="${escapeAttr(product.name)}">${product.name}</h3>

                    <div class="card-pricing-area">
                        <span class="card-price-main">${currency}${formatMoney(product.price)}</span>
                        ${hasWholesale ? `
                            <div class="card-wholesale-pill" title="Llevando 5 o más unidades">
                                <i data-lucide="tag" style="width: 12px; height: 12px;"></i>
                                <span>Mayorista: ${currency}${formatMoney(wholesalePrice)} (5+ un.)</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="card-actions-grid" onclick="event.stopPropagation()">
                        ${!isOutOfStock ? `
                            <button class="btn-card-add" onclick="addToCart('${product.id}', event)">
                                <i data-lucide="plus"></i>
                                <span>Agregar</span>
                            </button>
                        ` : `
                            <button class="btn-card-add" onclick="askProductDirect('${product.id}', event)">
                                <i data-lucide="message-circle"></i>
                                <span>Consultar</span>
                            </button>
                        `}
                        <button class="btn-card-detail" title="Ver detalles y especificaciones" onclick="openProductModal('${product.id}')">
                            <i data-lucide="eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

window.resetAllFilters = function() {
    activeCategory = '';
    const searchInput = document.getElementById('catalog-search');
    if (searchInput) searchInput.value = '';
    const stockCheck = document.getElementById('filter-stock');
    if (stockCheck) stockCheck.checked = false;

    renderCategoryTabs();
    filterCatalog();
};

function getCategoryPlaceholder(category) {
    let icon = 'package';
    const c = (category || '').toLowerCase();

    if (c.includes('indumentaria') || c.includes('jersey') || c.includes('campera') || c.includes('guante')) {
        icon = 'shirt';
    } else if (c.includes('casco') || c.includes('protec') || c.includes('antiparra')) {
        icon = 'shield';
    } else if (c.includes('freno') || c.includes('transmisi') || c.includes('motor') || c.includes('repuesto')) {
        icon = 'wrench';
    } else if (c.includes('lubricante') || c.includes('aceite') || c.includes('fluido')) {
        icon = 'droplet';
    } else if (c.includes('accesorio') || c.includes('tuning') || c.includes('manubrio')) {
        icon = 'zap';
    }

    return `
        <div class="product-card-placeholder">
            <i data-lucide="${icon}" class="placeholder-icon"></i>
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7;">HD RACING</span>
        </div>
    `;
}

window.handleImageError = function(imgElement, category) {
    const parent = imgElement.parentElement;
    if (parent) {
        parent.innerHTML = getCategoryPlaceholder(category);
        if (window.lucide) lucide.createIcons();
    }
};

/* ==========================================================================
   PRODUCT DETAIL MODAL
   ========================================================================== */
window.openProductModal = function(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    modalCurrentProduct = product;
    modalSelectedQty = 1;

    const currency = state.settings.currency || '$';

    document.getElementById('modal-product-category').textContent = product.category || 'General';
    document.getElementById('modal-product-sku').textContent = `SKU: ${product.sku || 'N/A'}`;
    document.getElementById('modal-product-title').textContent = product.name;
    document.getElementById('modal-product-price').textContent = `${currency}${formatMoney(product.price)}`;

    // Stock Specs
    const stockStatusEl = document.getElementById('modal-product-stock-status');
    const stockQtyEl = document.getElementById('modal-product-stock-qty');

    if (product.stock > 0) {
        stockStatusEl.textContent = 'Disponible en Local';
        stockStatusEl.style.color = 'var(--color-success)';
        stockQtyEl.textContent = `${product.stock} unidades`;
    } else {
        stockStatusEl.textContent = 'Sin Stock Inmediato (Consultar)';
        stockStatusEl.style.color = 'var(--text-muted)';
        stockQtyEl.textContent = '0 unidades';
    }

    // Wholesale Box
    const wholesaleBox = document.getElementById('modal-wholesale-box');
    const wholesalePrice = parseFloat(product.priceWholesale !== undefined ? product.priceWholesale : product.priceDiscount) || 0;
    if (wholesalePrice > 0 && wholesalePrice < product.price) {
        wholesaleBox.style.display = 'block';
        wholesaleBox.innerHTML = `
            <strong>Precio Mayorista (5 o más un.):</strong> ${currency}${formatMoney(wholesalePrice)} c/u
        `;
    } else {
        wholesaleBox.style.display = 'none';
    }

    // Description
    const descBox = document.getElementById('modal-product-desc-box');
    const descText = document.getElementById('modal-product-desc');
    if (product.description && product.description.trim().length > 0) {
        descBox.style.display = 'block';
        descText.textContent = product.description;
    } else {
        descBox.style.display = 'none';
    }

    // Image
    const imgContainer = document.getElementById('modal-image-container');
    if (product.image) {
        imgContainer.innerHTML = `<img src="${product.image}" alt="${escapeAttr(product.name)}">`;
    } else {
        imgContainer.innerHTML = getCategoryPlaceholder(product.category);
    }

    // Actions in Modal
    const actionRow = document.getElementById('modal-action-row');
    if (product.stock > 0) {
        actionRow.innerHTML = `
            <div class="qty-control-box" style="height: 44px;">
                <button class="qty-btn" onclick="modifyModalQty(-1)" aria-label="Disminuir"><i data-lucide="minus"></i></button>
                <span class="qty-val" id="modal-qty-display">1</span>
                <button class="qty-btn" onclick="modifyModalQty(1)" aria-label="Aumentar"><i data-lucide="plus"></i></button>
            </div>
            <button class="btn btn-primary" style="flex: 1;" onclick="addModalProductToCart()">
                <i data-lucide="shopping-bag"></i>
                <span>Agregar al Pedido</span>
            </button>
        `;
    } else {
        actionRow.innerHTML = `
            <button class="btn btn-primary btn-full-width" onclick="askProductDirect('${product.id}')">
                <i data-lucide="message-circle"></i>
                <span>Consultar Disponibilidad por WhatsApp</span>
            </button>
        `;
    }

    document.getElementById('modal-product-detail').classList.add('active');
    if (window.lucide) lucide.createIcons();
};

window.modifyModalQty = function(delta) {
    if (!modalCurrentProduct) return;
    const newQty = modalSelectedQty + delta;
    if (newQty >= 1 && newQty <= modalCurrentProduct.stock) {
        modalSelectedQty = newQty;
        const display = document.getElementById('modal-qty-display');
        if (display) display.textContent = modalSelectedQty;
    }
};

window.addModalProductToCart = function() {
    if (!modalCurrentProduct) return;
    addToCart(modalCurrentProduct.id, null, modalSelectedQty);
    closeProductModal();
};

window.closeProductModal = function() {
    document.getElementById('modal-product-detail').classList.remove('active');
};

/* ==========================================================================
   CART OPERATIONS
   ========================================================================== */
window.addToCart = function(productId, event, qtyToAdd = 1) {
    if (event) {
        event.stopPropagation();
    }

    const product = state.products.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;

    const existing = state.cart.find(item => item.product.id === productId);

    if (existing) {
        const potential = existing.qty + qtyToAdd;
        if (potential <= product.stock) {
            existing.qty = potential;
            showToast(`¡Se sumaron +${qtyToAdd} u. de ${product.name}!`, 'success');
        } else {
            const addable = product.stock - existing.qty;
            if (addable > 0) {
                existing.qty = product.stock;
                showToast(`Se agregaron las últimas ${addable} u. disponibles.`, 'warning');
            } else {
                showToast(`Ya tienes el stock máximo disponible (${product.stock} u.)`, 'warning');
            }
        }
    } else {
        const initial = Math.min(qtyToAdd, product.stock);
        state.cart.push({
            product: product,
            qty: initial
        });
        showToast(`¡${product.name} agregado a tu pedido!`, 'success');
    }

    saveCartToSession();
    updateCartUI();

    // Micro-animation for cart toggle button
    const cartToggle = document.getElementById('cart-toggle');
    if (cartToggle) {
        cartToggle.style.transform = 'scale(1.2)';
        setTimeout(() => { cartToggle.style.transform = 'scale(1)'; }, 200);
    }
};

window.changeCartQty = function(productId, delta) {
    const item = state.cart.find(i => i.product.id === productId);
    if (!item) return;

    const newQty = item.qty + delta;
    if (newQty <= 0) {
        removeFromCart(productId);
    } else if (newQty <= item.product.stock) {
        item.qty = newQty;
        saveCartToSession();
        updateCartUI();
    } else {
        showToast(`Límite de stock alcanzado (${item.product.stock} u.)`, 'warning');
    }
};

window.removeFromCart = function(productId) {
    state.cart = state.cart.filter(i => i.product.id !== productId);
    saveCartToSession();
    updateCartUI();
    showToast('Producto eliminado del pedido', 'info');
};

function updateCartUI() {
    const listEl = document.getElementById('cart-items-list');
    const totalQtyEl = document.getElementById('cart-items-total-qty');
    const totalPriceEl = document.getElementById('cart-total-price');
    const headerCount = document.getElementById('cart-count');
    const checkoutBtn = document.getElementById('btn-checkout');

    if (!listEl) return;

    const currency = state.settings.currency || '$';

    if (state.cart.length === 0) {
        listEl.innerHTML = `
            <div class="cart-empty-state">
                <div class="empty-icon-circle">
                    <i data-lucide="shopping-bag"></i>
                </div>
                <p class="empty-title">Tu lista está vacía</p>
                <p class="empty-text">Navegá por el catálogo y agregá los productos que te gustaría consultar o comprar.</p>
                <a href="#catalogo" class="btn btn-secondary" onclick="toggleCart()">Ver Catálogo</a>
            </div>
        `;
        if (totalQtyEl) totalQtyEl.textContent = '0';
        if (totalPriceEl) totalPriceEl.textContent = `${currency}0.00`;
        if (headerCount) headerCount.textContent = '0';
        if (checkoutBtn) checkoutBtn.disabled = true;
        if (window.lucide) lucide.createIcons();
        return;
    }

    if (checkoutBtn) checkoutBtn.disabled = false;

    let totalItems = 0;
    let totalPrice = 0;

    listEl.innerHTML = state.cart.map(item => {
        const retailPrice = item.product.price;
        const wholesalePrice = parseFloat(item.product.priceWholesale !== undefined ? item.product.priceWholesale : item.product.priceDiscount) || 0;
        const isWholesaleActive = item.qty >= 5 && wholesalePrice > 0 && wholesalePrice < retailPrice;
        const unitPrice = isWholesaleActive ? wholesalePrice : retailPrice;
        const lineTotal = unitPrice * item.qty;

        totalItems += item.qty;
        totalPrice += lineTotal;

        return `
            <div class="cart-item-row">
                <div class="cart-item-thumb">
                    ${item.product.image ? `
                        <img src="${item.product.image}" alt="${escapeAttr(item.product.name)}">
                    ` : `<i data-lucide="package"></i>`}
                </div>

                <div class="cart-item-info">
                    <h4 class="cart-item-name">${item.product.name}</h4>
                    <span class="cart-item-sku">SKU: ${item.product.sku || 'N/A'}</span>
                    <span class="cart-item-price-unit">
                        ${currency}${formatMoney(unitPrice)} c/u
                        ${isWholesaleActive ? '<span style="color: var(--color-warning); font-size: 11px;">(Mayorista)</span>' : ''}
                    </span>
                </div>

                <div class="cart-item-actions">
                    <button class="btn-remove-item" onclick="removeFromCart('${item.product.id}')" title="Eliminar del pedido">
                        <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                    </button>
                    <div class="qty-control-box">
                        <button class="qty-btn" onclick="changeCartQty('${item.product.id}', -1)" aria-label="Menos"><i data-lucide="minus"></i></button>
                        <span class="qty-val">${item.qty}</span>
                        <button class="qty-btn" onclick="changeCartQty('${item.product.id}', 1)" aria-label="Más"><i data-lucide="plus"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (totalQtyEl) totalQtyEl.textContent = totalItems;
    if (totalPriceEl) totalPriceEl.textContent = `${currency}${formatMoney(totalPrice)}`;
    if (headerCount) headerCount.textContent = totalItems;

    if (window.lucide) lucide.createIcons();
}

window.toggleCart = function() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    if (drawer && overlay) {
        drawer.classList.toggle('active');
        overlay.classList.toggle('active');
    }
};

/* ==========================================================================
   WHATSAPP ORDER GENERATION
   ========================================================================== */
window.checkoutWhatsApp = function() {
    if (state.cart.length === 0) {
        showToast('El carrito está vacío', 'warning');
        return;
    }

    const currency = state.settings.currency || '$';
    let message = `🏍️ *NUEVA CONSULTA DE PEDIDO - HD RACING* 🏍️\n`;
    message += `_Motos · Accesorios · Indumentaria_\n`;
    message += `*DISCIPLINA · MOTOR · LIBERTAD · PASIÓN*\n\n`;
    message += `Hola, me gustaría consultar la disponibilidad y coordinar la compra de los siguientes productos:\n\n`;
    message += `----------------------------------------\n`;

    let total = 0;
    state.cart.forEach((item, index) => {
        const retailPrice = item.product.price;
        const wholesalePrice = parseFloat(item.product.priceWholesale !== undefined ? item.product.priceWholesale : item.product.priceDiscount) || 0;
        const isWholesaleActive = item.qty >= 5 && wholesalePrice > 0 && wholesalePrice < retailPrice;
        const unitPrice = isWholesaleActive ? wholesalePrice : retailPrice;
        const lineTotal = unitPrice * item.qty;
        total += lineTotal;

        const wsTag = isWholesaleActive ? ' _[Precio Mayorista]_' : '';
        message += `${index + 1}. *${item.qty}x* ${item.product.name}\n`;
        message += `   • SKU: \`${item.product.sku || 'N/A'}\`\n`;
        message += `   • Unitario: ${currency}${formatMoney(unitPrice)}${wsTag}\n`;
        message += `   • Subtotal: *${currency}${formatMoney(lineTotal)}*\n\n`;
    });

    const isQR = state.paymentMethod === 'qr';
    const payText = isQR ? 'Transferencia / Alias MP (Comprobante adjunto)' : 'Efectivo / Retiro en Local';

    message += `----------------------------------------\n`;
    message += `💳 *Método de Pago Preferido:* ${payText}\n`;
    if (isQR) {
        message += `📍 *Alias de Pago:* \`${state.settings.storeAlias || 'HDRACING.OFICIAL'}\`\n`;
        message += `👤 *Titular:* ${state.settings.storeHolder || 'HD RACING S.R.L.'}\n`;
    }
    message += `💰 *TOTAL ESTIMADO:* *${currency}${formatMoney(total)}*\n\n`;
    message += `¿Tienen stock disponible para confirmar o pasar a retirar? ¡Muchas gracias!\n`;
    message += `📱 _Enviado desde el catálogo web oficial de HD Racing_`;

    const encoded = encodeURIComponent(message);
    const cleanPhone = (state.settings.whatsapp || '+5493795331132').replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;

    window.open(waUrl, '_blank');
};

window.askProductDirect = function(productId, event) {
    if (event) {
        event.stopPropagation();
    }

    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    const currency = state.settings.currency || '$';
    let message = `🏍️ *CONSULTA DIRECTA - HD RACING* 🏍️\n\n`;
    message += `Hola, me gustaría consultar información sobre este producto de su catálogo:\n\n`;
    message += `• *Producto:* ${product.name}\n`;
    message += `• *SKU:* \`${product.sku || 'N/A'}\`\n`;
    message += `• *Categoría:* ${product.category}\n`;
    message += `• *Precio en catálogo:* ${currency}${formatMoney(product.price)}\n\n`;

    if (product.stock <= 0) {
        message += `⚠️ _Figura sin stock inmediato. ¿Tienen fecha estimada de ingreso o reemplazo?_\n`;
    } else {
        message += `✅ _Consulto disponibilidad en local para coordinar retiro o compra._\n`;
    }

    const encoded = encodeURIComponent(message);
    const cleanPhone = (state.settings.whatsapp || '+5493795331132').replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;

    window.open(waUrl, '_blank');
};

/* ==========================================================================
   PAYMENT METHODS & MODAL ALIAS
   ========================================================================== */
window.selectPaymentMethod = function(method) {
    state.paymentMethod = method;

    const cashPill = document.getElementById('pay-option-cash');
    const qrPill = document.getElementById('pay-option-qr');
    const qrBtn = document.getElementById('btn-view-qr');

    if (method === 'qr') {
        if (cashPill) cashPill.classList.remove('active');
        if (qrPill) qrPill.classList.add('active');
        if (qrBtn) qrBtn.style.display = 'flex';
    } else {
        if (cashPill) cashPill.classList.add('active');
        if (qrPill) qrPill.classList.remove('active');
        if (qrBtn) qrBtn.style.display = 'none';
    }
};

window.openQRModal = function() {
    document.getElementById('modal-qr-payment').classList.add('active');
};

window.closeQRModal = function() {
    document.getElementById('modal-qr-payment').classList.remove('active');
};

window.copyModalAlias = function() {
    const alias = state.settings.storeAlias || 'HDRACING.OFICIAL';
    navigator.clipboard.writeText(alias).then(() => {
        const textSpan = document.getElementById('modal-copy-alias-text');
        if (textSpan) textSpan.textContent = '¡Copiado!';
        showToast(`Alias "${alias}" copiado al portapapeles`, 'success');
        setTimeout(() => {
            if (textSpan) textSpan.textContent = 'Copiar';
        }, 2500);
    }).catch(err => {
        showToast('No se pudo copiar automáticamente', 'warning');
    });
};

/* ==========================================================================
   PERSISTENCE (SESSION STORAGE)
   ========================================================================== */
function saveCartToSession() {
    try {
        sessionStorage.setItem('hdracing_cart', JSON.stringify(state.cart));
    } catch (e) {
        console.warn("No se pudo guardar el carrito en sessionStorage", e);
    }
}

function loadCartFromSession() {
    try {
        const saved = sessionStorage.getItem('hdracing_cart');
        if (saved) {
            state.cart = JSON.parse(saved);
        }
    } catch (e) {
        console.warn("No se pudo recuperar el carrito de sessionStorage", e);
    }
}

/* ==========================================================================
   TOAST NOTIFICATIONS
   ========================================================================== */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'warning') icon = 'alert-triangle';

    toast.innerHTML = `
        <i data-lucide="${icon}" style="width: 18px; height: 18px; flex-shrink: 0;"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 2800);
}

/* ==========================================================================
   HELPERS & UTILS
   ========================================================================== */
function formatMoney(amount) {
    return Number(amount || 0).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
