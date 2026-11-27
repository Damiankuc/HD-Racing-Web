/* ==========================================================================
   HD RACING - FRONTEND APPLICATION
   MOTOS · ACCESORIOS · INDUMENTARIA
   ========================================================================== */

/* Supabase Configuration (Conectado exclusivamente a la tienda HD Racing) */
const supabaseUrl = "https://wkgxssfbzgahkztdjzmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrZ3hzc2ZiemdhaGt6dGRqem1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzI4MjcsImV4cCI6MjA5NjA0ODgyN30.BNlE6dOMlbMlERR7ri4c4QIKqVXCJPHcZviTNunku44";
const HDRACING_STORE_ID = "6c2b4c0e-3e22-411f-9403-94e4b5bad19e"; // Cuenta: hdracing@gmail.com
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
    // Los datos de contacto y pago (teléfono, WhatsApp, Instagram, dirección, horario,
    // alias, titular, descripción) vienen SIEMPRE de Configuración del sistema.
    // Si un dato está vacío en el sistema, la web lo oculta en lugar de inventarlo.
    settings: {
        storeName: 'HD RACING',
        storeSlogan: 'MOTOS | ACCESORIOS | INDUMENTARIA',
        currency: '$'
    },
    cart: [],
    paymentMethod: 'cash' // 'cash' or 'qr'
};

// Valores de plantilla del sistema que no son datos reales de HD Racing
const TEMPLATE_PLACEHOLDER_VALUES = {
    storeAlias: ['DHMOTOPARTES'],
    storeHolder: ['DANIEL OSCAR HIDALGO'],
    storeAddress: ['AV. LIBERTADOR 2450, CIUDAD'],
    storePhone: ['+54 9 11 5555-1234']
};

let activeCategory = '';
let fuseInstance = null;
let modalCurrentProduct = null;
let modalSelectedQty = 1;
let modalSelection = { size: '', color: '' };

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
/**
 * Interpreta el "Horario de Atención" cargado en el sistema, por ejemplo:
 *   "Lunes a Sábado: 08:30 a 13:00 y 16:30 a 20:30 hs"
 *   "Lunes a Viernes 9 a 18"
 * Devuelve { days: [0..6], ranges: [[desde, hasta], ...] } o null si no se entiende.
 */
function parseOpeningHours(text) {
    if (!text) return null;
    const norm = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    const ranges = [];
    const rangeRe = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?\.?)?\s*(?:a|-|–|hasta)\s*(\d{1,2})(?:[:.](\d{2}))?/g;
    let m;
    while ((m = rangeRe.exec(norm)) !== null) {
        const from = parseInt(m[1], 10) + (parseInt(m[2] || '0', 10) / 60);
        const to = parseInt(m[3], 10) + (parseInt(m[4] || '0', 10) / 60);
        if (from >= 0 && from < 24 && to > 0 && to <= 24 && to > from) ranges.push([from, to]);
    }
    if (ranges.length === 0) return null;

    const dayIdx = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
    let days = null;
    if (/todos los dias|lunes a domingo/.test(norm)) {
        days = [0, 1, 2, 3, 4, 5, 6];
    } else {
        const span = norm.match(/(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s*(?:a|-|al)\s*(domingo|lunes|martes|miercoles|jueves|viernes|sabado)/);
        if (span) {
            days = [];
            let d = dayIdx[span[1]];
            const end = dayIdx[span[2]];
            for (let i = 0; i < 7; i++) {
                days.push(d);
                if (d === end) break;
                d = (d + 1) % 7;
            }
        }
    }
    if (!days) return null; // sin días claros no se muestra Abierto/Cerrado
    return { days, ranges };
}

// Día y hora actuales en Argentina (la tienda), sin importar dónde esté quien visita la web.
const STORE_TIME_ZONE = 'America/Argentina/Buenos_Aires';
function getStoreLocalTime(date = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: STORE_TIME_ZONE,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date);
        const get = (type) => (parts.find(p => p.type === type) || {}).value;
        const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const day = days[get('weekday')];
        const hour = parseInt(get('hour'), 10) % 24;
        const minute = parseInt(get('minute'), 10);
        if (day !== undefined && !isNaN(hour) && !isNaN(minute)) {
            return { day, timeVal: hour + minute / 60 };
        }
    } catch (e) {
        console.warn('No se pudo calcular la hora de Argentina, se usa la del dispositivo:', e);
    }
    return { day: date.getDay(), timeVal: date.getHours() + date.getMinutes() / 60 };
}

function updateStoreStatus() {
    const statusPill = document.querySelector('.store-status-pill');
    if (!statusPill) return;

    const schedule = parseOpeningHours(state.settings.openingHours);
    if (!schedule) {
        statusPill.hidden = true;
        return;
    }
    statusPill.hidden = false;

    const statusText = statusPill.querySelector('.status-text');
    const { day, timeVal } = getStoreLocalTime();

    const isOpen = schedule.days.includes(day) && schedule.ranges.some(([from, to]) => timeVal >= from && timeVal < to);

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
    if (supabaseClient) {
        try {
            console.log(`Conectando con Supabase para la tienda HD Racing (${HDRACING_STORE_ID})...`);
            const { data: catalogData, error } = await supabaseClient.rpc('get_public_catalog', {
                target_store_id: HDRACING_STORE_ID
            });

            if (!error && catalogData) {
                console.log("Catálogo cargado con éxito desde Supabase:", catalogData);
                populateCatalogData(catalogData);
                return;
            }
            if (error) {
                console.warn("Error RPC Supabase, usando catálogo local de respaldo:", error);
            }
        } catch (err) {
            console.warn("Fallo RPC Supabase, usando catálogo local de respaldo:", err);
        }
    }

    // Respaldo local si Supabase no está disponible
    await fetchLocalFallback();
}

async function fetchLocalFallback() {
    try {
        const response = await fetch('hdracing_db.json?v=' + Date.now());
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log("Catálogo local cargado correctamente:", data);
        // El respaldo local NO aporta datos de contacto/pago: esos solo vienen del sistema
        populateCatalogData({ ...data, settings: {} });
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
    state.products = Array.isArray(data.products) ? data.products : [];
    state.categories = Array.isArray(data.categories) ? data.categories : [];
    if (data.settings && typeof data.settings === 'object') {
        Object.entries(data.settings).forEach(([key, value]) => {
            if (value === undefined || value === null || String(value).trim() === '') return;
            // Ignorar valores de plantilla del sistema que no se personalizaron
            const placeholders = TEMPLATE_PLACEHOLDER_VALUES[key];
            if (placeholders && placeholders.includes(String(value).trim().toUpperCase())) return;
            state.settings[key] = typeof value === 'string' ? value.trim() : value;
        });
    }

    // Apply settings to DOM elements
    applySettingsToUI();
    updateStoreStatus();

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

    // Render initial product cards and update counter
    filterCatalog();
    updateCartUI();
}

/**
 * Número de WhatsApp (solo dígitos) a partir de lo cargado en el sistema.
 * Acepta "+54 9 379 ...", "https://wa.me/549...", "https://api.whatsapp.com/send?phone=549...".
 * Si no hay WhatsApp, usa el teléfono de contacto. Devuelve '' si no hay ninguno.
 */
function getWhatsAppNumber() {
    const raw = String(state.settings.whatsapp || '').trim();
    if (raw) {
        const fromUrl = raw.match(/(?:wa\.me\/|phone=)\+?(\d{6,})/i);
        if (fromUrl) return fromUrl[1];
        if (!/^https?:\/\//i.test(raw)) {
            const digits = raw.replace(/[^0-9]/g, '');
            if (digits.length >= 6) return digits;
        }
    }
    const phoneDigits = String(state.settings.storePhone || '').replace(/[^0-9]/g, '');
    return phoneDigits.length >= 6 ? phoneDigits : '';
}

function getWhatsAppLink() {
    const raw = String(state.settings.whatsapp || '').trim();
    if (/^https?:\/\//i.test(raw)) return raw; // link completo cargado en el sistema
    const num = getWhatsAppNumber();
    return num ? `https://wa.me/${num}` : '';
}

function getInstagramLink() {
    const ig = String(state.settings.instagram || '').trim();
    if (!ig) return '';
    if (/^https?:\/\//i.test(ig)) return ig;
    const username = ig.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//i, '').replace(/\/+$/, '');
    return username ? `https://instagram.com/${username}` : '';
}

function openWhatsAppWithMessage(message) {
    const num = getWhatsAppNumber();
    if (!num) {
        showToast('La tienda todavía no cargó su número de WhatsApp.', 'warning');
        return;
    }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, '_blank');
}

function setRowText(rowId, textId, value) {
    const row = document.getElementById(rowId);
    const textEl = document.getElementById(textId);
    const text = (value || '').toString().trim();
    if (textEl) textEl.textContent = text;
    if (row) row.hidden = !text;
}

function setLink(linkId, href) {
    const link = document.getElementById(linkId);
    if (!link) return;
    if (href) {
        link.href = href;
        link.hidden = false;
    } else {
        link.removeAttribute('href');
        link.hidden = true;
    }
}

function applySettingsToUI() {
    const s = state.settings;

    // Contacto & Ubicación (fila oculta si el dato está vacío en el sistema)
    setRowText('footer-address-row', 'footer-address', s.storeAddress);
    setRowText('footer-phone-row', 'footer-phone', s.storePhone);
    setRowText('footer-hours-row', 'footer-hours', s.openingHours);

    // Canales oficiales
    setLink('footer-whatsapp-link', getWhatsAppLink());
    setLink('footer-instagram-link', getInstagramLink());

    // Descripción de marca
    const bioEl = document.getElementById('footer-bio');
    if (bioEl && s.brandDescription) bioEl.textContent = s.brandDescription;

    // Datos de transferencia
    const holderEl = document.getElementById('modal-display-holder');
    if (holderEl) holderEl.textContent = s.storeHolder || '—';
    const aliasEl = document.getElementById('modal-display-alias');
    if (aliasEl) aliasEl.textContent = s.storeAlias || 'Consultar por WhatsApp';
    const copyBtn = document.getElementById('modal-copy-alias-btn');
    if (copyBtn) copyBtn.hidden = !s.storeAlias;
}

/* ==========================================================================
   VARIANTES (TALLE / COLOR) — vienen del sistema en product.variants
   [{ id, size, color, stock }]; product.stock es la suma de todas.
   ========================================================================== */
function productHasVariants(product) {
    return !!(product && Array.isArray(product.variants) && product.variants.length > 0);
}

function variantField(v, key) {
    return ((v && v[key]) || '').toString().trim();
}

function getVariantLabel(v) {
    return [variantField(v, 'size'), variantField(v, 'color')].filter(Boolean).join(' / ') || 'Única';
}

function uniqueVariantValues(product, key) {
    const seen = [];
    (product.variants || []).forEach(v => {
        const val = variantField(v, key);
        if (val && !seen.includes(val)) seen.push(val);
    });
    return seen;
}

function variantStock(v) {
    return Math.max(0, parseInt(v && v.stock, 10) || 0);
}

function findVariantBySelection(product, size, color) {
    if (!productHasVariants(product)) return null;
    return product.variants.find(v => variantField(v, 'size') === size && variantField(v, 'color') === color) || null;
}

function getCartKey(item) {
    return item.key || (item.product && item.product.id) || '';
}

/* ==========================================================================
   CATEGORY TABS RENDERING
   ========================================================================== */
function renderCategoryTabs() {
    const tabsContainer = document.getElementById('category-tabs');
    if (!tabsContainer) return;

    // Build unique categories list (only categories with products)
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
        if (count > 0) {
            html += `
                <button class="category-tab-btn" onclick="setCategory('${escapeAttr(cat)}', this)">
                    <span>${cat}</span>
                    <span style="opacity: 0.6; font-size: 11.5px;">(${count})</span>
                </button>
            `;
        }
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
        if (state.products.length === 0) {
            grid.innerHTML = `
                <div class="grid-loading">
                    <i data-lucide="package" style="width: 48px; height: 48px; margin: 0 auto 12px; display: block; color: var(--text-muted);"></i>
                    <p style="font-size: 16px; font-weight: 700; color: #ffffff;">Catálogo en preparación</p>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Todavía no hay productos publicados en esta tienda. Consultanos directamente por WhatsApp.</p>
                </div>
            `;
        } else {
            grid.innerHTML = `
                <div class="grid-loading">
                    <i data-lucide="package-search" style="width: 48px; height: 48px; margin: 0 auto 12px; display: block; color: var(--text-muted);"></i>
                    <p style="font-size: 16px; font-weight: 700; color: #ffffff;">No encontramos productos con ese criterio</p>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Probá modificando la búsqueda o quitando los filtros de categoría.</p>
                    <button class="btn btn-secondary" style="margin-top: 16px;" onclick="resetAllFilters()">Restablecer filtros</button>
                </div>
            `;
        }
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

        // Resumen de talles / colores disponibles
        const hasVariants = productHasVariants(product);
        let variantsLine = '';
        if (hasVariants) {
            const inStock = product.variants.filter(v => variantStock(v) > 0);
            const sizes = uniqueVariantValues({ variants: inStock }, 'size');
            const colors = uniqueVariantValues({ variants: inStock }, 'color');
            const parts = [];
            if (sizes.length) parts.push(`Talles: ${sizes.join(' · ')}`);
            if (colors.length) parts.push(colors.length === 1 ? `Color: ${colors[0]}` : `${colors.length} colores`);
            if (parts.length) variantsLine = `<span class="card-variants-line" title="${escapeAttr(parts.join(' | '))}">${escapeAttr(parts.join(' | '))}</span>`;
        }
        // Con talles/colores, "Agregar" abre el detalle para elegir la combinación
        const addAction = hasVariants
            ? `openProductModal('${product.id}')`
            : `addToCart('${product.id}', event)`;

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
                    ${variantsLine}

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
                            <button class="btn-card-add" onclick="${addAction}">
                                <i data-lucide="${hasVariants ? 'shirt' : 'plus'}"></i>
                                <span>${hasVariants ? (uniqueVariantValues(product, 'size').length ? 'Elegir talle' : 'Elegir color') : 'Agregar'}</span>
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
    modalSelection = { size: '', color: '' };

    // Preseleccionar si solo hay una opción con stock en cada dimensión
    if (productHasVariants(product)) {
        const available = product.variants.filter(v => variantStock(v) > 0);
        const sizes = uniqueVariantValues({ variants: available }, 'size');
        const colors = uniqueVariantValues({ variants: available }, 'color');
        if (sizes.length === 1) modalSelection.size = sizes[0];
        if (colors.length === 1) modalSelection.color = colors[0];
    }

    const currency = state.settings.currency || '$';

    document.getElementById('modal-product-category').textContent = product.category || 'General';
    document.getElementById('modal-product-sku').textContent = `SKU: ${product.sku || 'N/A'}`;
    document.getElementById('modal-product-title').textContent = product.name;
    document.getElementById('modal-product-price').textContent = `${currency}${formatMoney(product.price)}`;

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

    renderModalPurchaseArea();

    document.getElementById('modal-product-detail').classList.add('active');
};

// Variante elegida en el modal (null si falta elegir talle o color)
function getModalSelectedVariant() {
    const product = modalCurrentProduct;
    if (!productHasVariants(product)) return null;
    return findVariantBySelection(product, modalSelection.size, modalSelection.color);
}

// Stock máximo comprable desde el modal
function getModalMaxStock() {
    const product = modalCurrentProduct;
    if (!product) return 0;
    if (!productHasVariants(product)) return Math.max(0, product.stock || 0);
    const variant = getModalSelectedVariant();
    return variant ? variantStock(variant) : 0;
}

// ¿Existe alguna combinación con stock para este valor? (Si no combina con lo ya elegido,
// al tocarlo se limpia la otra selección, así el cliente puede cambiar directo de opción.)
function isVariantOptionAvailable(product, key, value) {
    return product.variants.some(v => variantField(v, key) === value && variantStock(v) > 0);
}

window.selectModalVariantOption = function(key, value) {
    const product = modalCurrentProduct;
    if (!productHasVariants(product)) return;
    if (modalSelection[key] === value) return; // ya elegido
    modalSelection[key] = value;

    // Si la combinación con la otra dimensión no tiene stock, limpiar la otra
    const otherKey = key === 'size' ? 'color' : 'size';
    if (modalSelection[key] && modalSelection[otherKey]) {
        const combo = findVariantBySelection(product, modalSelection.size, modalSelection.color);
        if (!combo || variantStock(combo) <= 0) modalSelection[otherKey] = '';
    }
    // Si para lo elegido queda una sola opción con stock en la otra dimensión, elegirla
    if (modalSelection[key] && !modalSelection[otherKey]) {
        const remaining = uniqueVariantValues({
            variants: product.variants.filter(v => variantField(v, key) === modalSelection[key] && variantStock(v) > 0)
        }, otherKey);
        if (remaining.length === 1) modalSelection[otherKey] = remaining[0];
    }
    modalSelectedQty = 1;
    renderModalPurchaseArea();
};

function renderModalVariantPicker() {
    const box = document.getElementById('modal-variant-picker');
    if (!box) return;
    const product = modalCurrentProduct;
    if (!productHasVariants(product)) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }

    const sizes = uniqueVariantValues(product, 'size');
    const colors = uniqueVariantValues(product, 'color');

    const group = (key, label, values) => {
        if (!values.length) return '';
        const chips = values.map(val => {
            const available = isVariantOptionAvailable(product, key, val);
            const active = modalSelection[key] === val;
            return `<button type="button" class="variant-chip ${active ? 'active' : ''}" ${available || active ? '' : 'disabled'}
                        data-key="${key}" data-value="${escapeAttr(val)}"
                        onclick="selectModalVariantOption(this.dataset.key, this.dataset.value)">${escapeAttr(val)}</button>`;
        }).join('');
        const chosen = modalSelection[key] ? `<strong>${escapeAttr(modalSelection[key])}</strong>` : '';
        return `
            <div>
                <span class="variant-group-label">${label}${chosen}</span>
                <div class="variant-chip-row">${chips}</div>
            </div>`;
    };

    const needSize = sizes.length > 0 && !modalSelection.size;
    const needColor = colors.length > 0 && !modalSelection.color;
    let hint = '';
    if (product.stock > 0 && (needSize || needColor)) {
        hint = `<span class="variant-hint">Elegí ${needSize && needColor ? 'talle y color' : (needSize ? 'un talle' : 'un color')} para agregar al pedido.</span>`;
    }

    box.innerHTML = group('size', 'Talle', sizes) + group('color', 'Color', colors) + hint;
    box.hidden = false;
}

function renderModalPurchaseArea() {
    const product = modalCurrentProduct;
    if (!product) return;

    renderModalVariantPicker();

    const hasVariants = productHasVariants(product);
    const variant = getModalSelectedVariant();
    const stockStatusEl = document.getElementById('modal-product-stock-status');
    const stockQtyEl = document.getElementById('modal-product-stock-qty');
    const actionRow = document.getElementById('modal-action-row');

    // Stock Specs
    if (product.stock <= 0) {
        stockStatusEl.textContent = 'Sin Stock Inmediato (Consultar)';
        stockStatusEl.style.color = 'var(--text-muted)';
        stockQtyEl.textContent = '0 unidades';
    } else if (hasVariants && !variant) {
        stockStatusEl.textContent = 'Disponible en Local';
        stockStatusEl.style.color = 'var(--color-success)';
        stockQtyEl.textContent = 'Elegí una opción';
    } else {
        const qty = hasVariants ? variantStock(variant) : product.stock;
        stockStatusEl.textContent = qty > 0 ? 'Disponible en Local' : 'Sin stock en esta opción';
        stockStatusEl.style.color = qty > 0 ? 'var(--color-success)' : 'var(--text-muted)';
        stockQtyEl.textContent = `${qty} unidades${hasVariants ? ` (${getVariantLabel(variant)})` : ''}`;
    }

    // Actions in Modal
    if (product.stock > 0) {
        const canAdd = !hasVariants || (variant && variantStock(variant) > 0);
        actionRow.innerHTML = `
            <div class="qty-control-box" style="height: 44px;">
                <button class="qty-btn" onclick="modifyModalQty(-1)" aria-label="Disminuir" ${canAdd ? '' : 'disabled'}><i data-lucide="minus"></i></button>
                <span class="qty-val" id="modal-qty-display">${modalSelectedQty}</span>
                <button class="qty-btn" onclick="modifyModalQty(1)" aria-label="Aumentar" ${canAdd ? '' : 'disabled'}><i data-lucide="plus"></i></button>
            </div>
            <button class="btn btn-primary" style="flex: 1;" onclick="addModalProductToCart()" ${canAdd ? '' : 'disabled'}>
                <i data-lucide="shopping-bag"></i>
                <span>${canAdd ? 'Agregar al Pedido' : 'Elegí talle / color'}</span>
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

    if (window.lucide) lucide.createIcons();
}

window.modifyModalQty = function(delta) {
    if (!modalCurrentProduct) return;
    const newQty = modalSelectedQty + delta;
    if (newQty >= 1 && newQty <= getModalMaxStock()) {
        modalSelectedQty = newQty;
        const display = document.getElementById('modal-qty-display');
        if (display) display.textContent = modalSelectedQty;
    }
};

window.addModalProductToCart = function() {
    if (!modalCurrentProduct) return;
    if (productHasVariants(modalCurrentProduct)) {
        const variant = getModalSelectedVariant();
        if (!variant) {
            showToast('Elegí talle y color antes de agregar', 'warning');
            return;
        }
        addToCart(modalCurrentProduct.id, null, modalSelectedQty, variant.id);
    } else {
        addToCart(modalCurrentProduct.id, null, modalSelectedQty);
    }
    closeProductModal();
};

window.closeProductModal = function() {
    document.getElementById('modal-product-detail').classList.remove('active');
};

/* ==========================================================================
   CART OPERATIONS
   ========================================================================== */
window.addToCart = function(productId, event, qtyToAdd = 1, variantId = null) {
    if (event) {
        event.stopPropagation();
    }

    const product = state.products.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;

    // Producto con talles/colores: hay que elegir la combinación en el detalle
    let variant = null;
    if (productHasVariants(product)) {
        variant = product.variants.find(v => v.id === variantId) || null;
        if (!variant) {
            openProductModal(productId);
            return;
        }
    }

    const maxStock = variant ? variantStock(variant) : product.stock;
    if (maxStock <= 0) return;
    const key = variant ? `${product.id}::${variant.id}` : product.id;
    const displayName = variant ? `${product.name} (${getVariantLabel(variant)})` : product.name;

    const existing = state.cart.find(item => getCartKey(item) === key);

    if (existing) {
        const potential = existing.qty + qtyToAdd;
        if (potential <= maxStock) {
            existing.qty = potential;
            showToast(`¡Se sumaron +${qtyToAdd} u. de ${displayName}!`, 'success');
        } else {
            const addable = maxStock - existing.qty;
            if (addable > 0) {
                existing.qty = maxStock;
                showToast(`Se agregaron las últimas ${addable} u. disponibles.`, 'warning');
            } else {
                showToast(`Ya tienes el stock máximo disponible (${maxStock} u.)`, 'warning');
            }
        }
    } else {
        const initial = Math.min(qtyToAdd, maxStock);
        const line = {
            key,
            product: product,
            qty: initial
        };
        if (variant) {
            line.variantId = variant.id;
            line.variantLabel = getVariantLabel(variant);
            line.size = variantField(variant, 'size');
            line.color = variantField(variant, 'color');
        }
        state.cart.push(line);
        showToast(`¡${displayName} agregado a tu pedido!`, 'success');
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

function getCartItemMaxStock(item) {
    if (item.variantId && productHasVariants(item.product)) {
        const v = item.product.variants.find(x => x.id === item.variantId);
        return v ? variantStock(v) : 0;
    }
    return item.product.stock;
}

window.changeCartQty = function(key, delta) {
    const item = state.cart.find(i => getCartKey(i) === key);
    if (!item) return;

    const maxStock = getCartItemMaxStock(item);
    const newQty = item.qty + delta;
    if (newQty <= 0) {
        removeFromCart(key);
    } else if (newQty <= maxStock) {
        item.qty = newQty;
        saveCartToSession();
        updateCartUI();
    } else {
        showToast(`Límite de stock alcanzado (${maxStock} u.)`, 'warning');
    }
};

window.removeFromCart = function(key) {
    state.cart = state.cart.filter(i => getCartKey(i) !== key);
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
                    ${item.variantId ? `<span class="cart-item-variant">${escapeAttr([item.size ? `Talle ${item.size}` : '', item.color || ''].filter(Boolean).join(' · ') || item.variantLabel || '')}</span>` : ''}
                    <span class="cart-item-sku">SKU: ${item.product.sku || 'N/A'}</span>
                    <span class="cart-item-price-unit">
                        ${currency}${formatMoney(unitPrice)} c/u
                        ${isWholesaleActive ? '<span style="color: var(--color-warning); font-size: 11px;">(Mayorista)</span>' : ''}
                    </span>
                </div>

                <div class="cart-item-actions">
                    <button class="btn-remove-item" onclick="removeFromCart('${escapeAttr(getCartKey(item))}')" title="Eliminar del pedido">
                        <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                    </button>
                    <div class="qty-control-box">
                        <button class="qty-btn" onclick="changeCartQty('${escapeAttr(getCartKey(item))}', -1)" aria-label="Menos"><i data-lucide="minus"></i></button>
                        <span class="qty-val">${item.qty}</span>
                        <button class="qty-btn" onclick="changeCartQty('${escapeAttr(getCartKey(item))}', 1)" aria-label="Más"><i data-lucide="plus"></i></button>
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
        if (item.variantId) {
            const parts = [];
            if (item.size) parts.push(`Talle: *${item.size}*`);
            if (item.color) parts.push(`Color: *${item.color}*`);
            message += `   • ${parts.length ? parts.join(' · ') : `Variante: *${item.variantLabel || ''}*`}\n`;
        }
        message += `   • SKU: \`${item.product.sku || 'N/A'}\`\n`;
        message += `   • Unitario: ${currency}${formatMoney(unitPrice)}${wsTag}\n`;
        message += `   • Subtotal: *${currency}${formatMoney(lineTotal)}*\n\n`;
    });

    const isQR = state.paymentMethod === 'qr';
    const payText = isQR ? 'Transferencia / Alias MP (Comprobante adjunto)' : 'Efectivo / Retiro en Local';

    message += `----------------------------------------\n`;
    message += `💳 *Método de Pago Preferido:* ${payText}\n`;
    if (isQR) {
        if (state.settings.storeAlias) {
            message += `📍 *Alias de Pago:* \`${state.settings.storeAlias}\`\n`;
            if (state.settings.storeHolder) message += `👤 *Titular:* ${state.settings.storeHolder}\n`;
        } else {
            message += `📍 _Por favor, envíenme los datos para la transferencia._\n`;
        }
    }
    message += `💰 *TOTAL ESTIMADO:* *${currency}${formatMoney(total)}*\n\n`;
    message += `¿Tienen stock disponible para confirmar o pasar a retirar? ¡Muchas gracias!\n`;
    message += `📱 _Enviado desde el catálogo web oficial de HD Racing_`;

    openWhatsAppWithMessage(message);
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

    openWhatsAppWithMessage(message);
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
    const alias = state.settings.storeAlias || '';
    if (!alias) {
        showToast('Pedinos los datos de transferencia por WhatsApp', 'info');
        return;
    }
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
