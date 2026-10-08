// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN
// ==========================================
const firebaseConfig = {
    databaseURL: "https://ferre-pos-default-rtdb.firebaseio.com"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = (typeof firebase !== 'undefined') ? firebase.database() : null;

let allProducts = JSON.parse(localStorage.getItem('ferre_products')) || {};
let allSales = JSON.parse(localStorage.getItem('ferre_sales')) || {};
let bankSettings = JSON.parse(localStorage.getItem('ferre_bank')) || {};
let termsSettings = localStorage.getItem('ferre_terms') || "Precios sujetos a cambio sin previo aviso.";

let cart = [];
let html5QrCode = null;
let activeScannerTarget = null;
let currentTimeFilter = 'all';
let currentReportTimeFilter = 'all';
let currentCatalogCategoryFilter = 'todos';
let currentPosCategoryFilter = 'todos';
let selectedProductForQtyModal = null;

const defaultMargins = {
    electrico: 20,
    ferreteria: 27,
    plomeria: 27,
    general: 20
};

function updateOnlineStatus() {
    const statusElem = document.getElementById("cloud-status");
    if (navigator.onLine) {
        if (statusElem) statusElem.innerHTML = "🟢 Conectado";
        syncOfflineData();
    } else {
        if (statusElem) statusElem.innerHTML = "🟠 Sin Red (Offline)";
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

if (db) {
    db.ref(".info/connected").on("value", (snap) => {
        if (snap.val() === true && navigator.onLine) {
            updateOnlineStatus();
        }
    });

    db.ref("products").on("value", (snapshot) => {
        const val = snapshot.val() || {};
        allProducts = val;
        localStorage.setItem('ferre_products', JSON.stringify(val));
        renderCatalog();
        renderPOSCatalog();
    });

    db.ref("sales").on("value", (snapshot) => {
        const val = snapshot.val() || {};
        allSales = val;
        localStorage.setItem('ferre_sales', JSON.stringify(val));
        renderHistory();
        calculateReports();
    });

    db.ref("settings").on("value", (snapshot) => {
        const val = snapshot.val() || {};
        if (val.bank) {
            bankSettings = val.bank;
            localStorage.setItem('ferre_bank', JSON.stringify(val.bank));
            if (document.getElementById('bank-name')) document.getElementById('bank-name').value = val.bank.name || '';
            if (document.getElementById('bank-holder')) document.getElementById('bank-holder').value = val.bank.holder || '';
            if (document.getElementById('bank-clabe')) document.getElementById('bank-clabe').value = val.bank.clabe || '';
            if (document.getElementById('bank-account')) document.getElementById('bank-account').value = val.bank.account || '';
        }
        if (val.terms) {
            termsSettings = val.terms;
            localStorage.setItem('ferre_terms', val.terms);
            if (document.getElementById('terms-text')) document.getElementById('terms-text').value = val.terms;
        }
    });
}

function syncOfflineData() {
    const pendingSales = JSON.parse(localStorage.getItem('ferre_pending_sales')) || [];
    if (pendingSales.length > 0 && db) {
        pendingSales.forEach(sale => {
            db.ref("sales/" + sale.folio).set(sale);
        });
        localStorage.removeItem('ferre_pending_sales');
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast-msg');
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
}

function getSortedProducts(productsObj) {
    return Object.keys(productsObj)
        .map(key => ({ key: key, ...productsObj[key] }))
        .sort((a, b) => {
            if (a.price !== b.price) {
                return (a.price || 0) - (b.price || 0);
            }
            return (a.name || '').localeCompare(b.name || '');
        });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    const activeTab = document.getElementById('tab-' + tabName);
    if (activeTab) activeTab.style.display = 'block';

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('btn-' + tabName);
    if (activeBtn) activeBtn.classList.add('active');
}

function toggleStockField(checked) {
    const container = document.getElementById('stock-field-container');
    if (container) container.style.display = checked ? 'block' : 'none';
}

function toggleExpiryInput(checked) {
    const container = document.getElementById('expiry-container');
    if (container) container.style.display = checked ? 'block' : 'none';
}

function toggleMobileCart() {
    const cartSection = document.getElementById('cart-section');
    if (cartSection) {
        cartSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// ==========================================
// 2. MODAL DE CATÁLOGO (NUEVO / EDITAR)
// ==========================================
function openProductModal() {
    cancelEditProduct();
    document.getElementById('product-modal-backdrop').style.display = 'flex';
}

function closeProductModal() {
    document.getElementById('product-modal-backdrop').style.display = 'none';
}

function applyDefaultCategoryMargin() {
    const category = document.getElementById('prod-category').value;
    const marginInput = document.getElementById('prod-margin-pct');
    if (marginInput && defaultMargins[category] !== undefined) {
        marginInput.value = defaultMargins[category];
    }
}

function calculatePriceFromMargin() {
    const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
    const marginPct = parseFloat(document.getElementById('prod-margin-pct').value) || 0;

    if (cost <= 0) {
        alert("⚠️ Por favor ingresa primero el Costo Empresa.");
        return;
    }

    const rawPrice = cost * (1 + (marginPct / 100));
    const roundedPrice = Math.ceil(rawPrice);
    document.getElementById('prod-price').value = roundedPrice;
    showToast("Calculado: $" + roundedPrice + ".00 MXN");
}

function saveProduct() {
    const code = document.getElementById('prod-code-input').value.trim();
    const barcode = document.getElementById('prod-barcode').value.trim();
    const name = document.getElementById('prod-name').value.trim();
    const category = document.getElementById('prod-category').value;
    const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
    const price = parseFloat(document.getElementById('prod-price').value) || 0;
    const trackStock = document.getElementById('prod-track-stock').checked;
    const stock = trackStock ? (parseInt(document.getElementById('prod-stock').value) || 0) : 'N/A';
    const editingKey = document.getElementById('editing-product-key').value;

    if (!code || !name) {
        alert("⚠️ Ingresa el Código del Producto y el Nombre.");
        return;
    }

    const cleanKey = code.replace(/[.#$/[\]]/g, "_");
    const newProduct = { code, barcode, name, category, cost, price, trackStock, stock };

    if (editingKey && editingKey !== cleanKey) {
        delete allProducts[editingKey];
        if (db) db.ref("products/" + editingKey).remove();
    }

    allProducts[cleanKey] = newProduct;
    localStorage.setItem('ferre_products', JSON.stringify(allProducts));

    if (db && navigator.onLine) {
        db.ref("products/" + cleanKey).set(newProduct);
    }

    showToast(editingKey ? "✅ Producto actualizado" : "✅ Producto guardado");
    closeProductModal();
    renderCatalog();
    renderPOSCatalog();
}

function editProduct(key) {
    const p = allProducts[key];
    if (!p) return;

    document.getElementById('editing-product-key').value = key;
    document.getElementById('catalog-form-title').innerText = "✏️ Modificar: " + p.name;
    document.getElementById('prod-code-input').value = p.code || p.sku || '';
    document.getElementById('prod-barcode').value = p.barcode || '';
    document.getElementById('prod-name').value = p.name || '';
    document.getElementById('prod-category').value = p.category || 'general';
    document.getElementById('prod-cost').value = p.cost || 0;
    document.getElementById('prod-price').value = p.price || 0;
    applyDefaultCategoryMargin();
    
    const trackStock = p.trackStock !== false && p.stock !== 'N/A';
    document.getElementById('prod-track-stock').checked = trackStock;
    toggleStockField(trackStock);
    document.getElementById('prod-stock').value = trackStock ? p.stock : 10;

    document.getElementById('btn-save-prod').innerText = "Guardar Cambios ✏️";
    document.getElementById('product-modal-backdrop').style.display = 'flex';
}

function cancelEditProduct() {
    document.getElementById('editing-product-key').value = '';
    document.getElementById('catalog-form-title').innerText = "Registrar Nuevo Producto";
    document.getElementById('prod-code-input').value = '';
    document.getElementById('prod-barcode').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-cost').value = '';
    document.getElementById('prod-price').value = '';
    applyDefaultCategoryMargin();
    document.getElementById('btn-save-prod').innerText = "Guardar ☁️";
}

function filterCatalogCategory(category) {
    currentCatalogCategoryFilter = category;
    
    document.querySelectorAll('#tab-catalog .categories-bar .btn').forEach(btn => btn.classList.remove('active-cat'));
    const activeBtn = document.getElementById('btn-cat-filter-' + category);
    if (activeBtn) activeBtn.classList.add('active-cat');

    renderCatalog(document.getElementById('catalog-search').value);
}

function renderCatalog(filterQuery = '') {
    const tbody = document.getElementById('catalog-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sorted = getSortedProducts(allProducts);
    const q = filterQuery.toLowerCase().trim();

    sorted.forEach(p => {
        if (currentCatalogCategoryFilter !== 'todos' && p.category !== currentCatalogCategoryFilter) return;

        const itemCode = (p.code || p.sku || '').toLowerCase();
        const itemBarcode = (p.barcode || '').toLowerCase();
        const itemName = (p.name || '').toLowerCase();

        if (q && !itemCode.includes(q) && !itemBarcode.includes(q) && !itemName.includes(q)) return;

        const profit = (p.price || 0) - (p.cost || 0);
        const tr = document.createElement('tr');
        
        const displayCode = p.barcode ? `<b>${p.code}</b><br><small style="color:#2563eb;">📷 ${p.barcode}</small>` : `<b>${p.code}</b>`;

        tr.innerHTML = `
            <td>${displayCode}</td>
            <td>${p.name}</td>
            <td><span class="badge">${p.category || 'General'}</span></td>
            <td>$${parseFloat(p.cost || 0).toFixed(2)}</td>
            <td><b>$${parseFloat(p.price || 0).toFixed(2)}</b></td>
            <td style="color: var(--success); font-weight: bold;">$${profit.toFixed(2)}</td>
            <td>${p.stock}</td>
            <td>
                <button class="btn btn-warning btn-sm" onclick="editProduct('${p.key}')">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.key}')">✕</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterCatalogTable(query) {
    renderCatalog(query);
}

function deleteProduct(key) {
    if (confirm("¿Eliminar este producto?")) {
        delete allProducts[key];
        localStorage.setItem('ferre_products', JSON.stringify(allProducts));
        if (db && navigator.onLine) db.ref("products/" + key).remove();
        renderCatalog();
        renderPOSCatalog();
    }
}

// ==========================================
// 3. PUNTO DE VENTA Y MODAL DE CANTIDAD
// ==========================================
function openQtyModal(key) {
    const product = allProducts[key];
    if (!product) return;

    selectedProductForQtyModal = product;
    document.getElementById('qty-modal-prod-name').innerText = product.name;
    document.getElementById('qty-modal-prod-price').innerText = '$' + parseFloat(product.price || 0).toFixed(2) + ' MXN';
    
    const existingInCart = cart.find(item => item.key === key);
    document.getElementById('qty-modal-input').value = existingInCart ? existingInCart.qty : 1;

    document.getElementById('qty-modal-backdrop').style.display = 'flex';
}

function closeQtyModal() {
    document.getElementById('qty-modal-backdrop').style.display = 'none';
    selectedProductForQtyModal = null;
}

function changeQtyModalInput(delta) {
    const input = document.getElementById('qty-modal-input');
    let currentVal = parseInt(input.value) || 1;
    currentVal += delta;
    if (currentVal < 1) currentVal = 1;
    input.value = currentVal;
}

function confirmQtyModalAdd() {
    if (!selectedProductForQtyModal) return;

    const qty = parseInt(document.getElementById('qty-modal-input').value) || 1;
    const key = selectedProductForQtyModal.key;

    const existingIndex = cart.findIndex(item => item.key === key);
    if (existingIndex > -1) {
        cart[existingIndex].qty = qty;
    } else {
        cart.push({
            key: key,
            code: selectedProductForQtyModal.code,
            name: selectedProductForQtyModal.name,
            cost: parseFloat(selectedProductForQtyModal.cost || 0),
            price: parseFloat(selectedProductForQtyModal.price || 0),
            qty: qty
        });
    }

    renderCart();
    closeQtyModal();
    showToast("🛒 Carrito actualizado");
}

function renderPOSCatalog(filterQuery = '') {
    const container = document.getElementById('pos-products-compact-list');
    if (!container) return;
    container.innerHTML = '';

    const sorted = getSortedProducts(allProducts);
    const q = filterQuery.toLowerCase().trim();

    sorted.forEach(p => {
        if (currentPosCategoryFilter !== 'todos' && p.category !== currentPosCategoryFilter) return;

        const itemCode = (p.code || p.sku || '').toLowerCase();
        const itemBarcode = (p.barcode || '').toLowerCase();
        const itemName = (p.name || '').toLowerCase();

        if (q && !itemCode.includes(q) && !itemBarcode.includes(q) && !itemName.includes(q)) return;

        const cartItem = cart.find(ci => ci.key === p.key);
        const qtyBadge = cartItem ? `<span style="background:var(--success); color:white; padding:1px 5px; border-radius:10px; font-size:0.65rem; margin-left:4px;">${cartItem.qty} en carrito</span>` : '';

        const card = document.createElement('div');
        card.className = 'prod-card-item';
        card.onclick = () => openQtyModal(p.key);

        card.innerHTML = `
            <div>
                <div class="prod-card-title">${p.name} ${qtyBadge}</div>
                <div class="prod-card-code">${p.barcode ? '📷 ' + p.barcode : p.code}</div>
            </div>
            <div class="prod-card-price">$${parseFloat(p.price || 0).toFixed(2)}</div>
        `;
        container.appendChild(card);
    });
}

function searchProduct(query) {
    renderPOSCatalog(query);
}

function filterCategory(cat) {
    currentPosCategoryFilter = cat;
    
    document.querySelectorAll('#tab-pos .categories-bar .btn').forEach(btn => btn.classList.remove('active-cat'));
    const activeBtn = document.getElementById('btn-pos-cat-' + cat);
    if (activeBtn) activeBtn.classList.add('active-cat');

    renderPOSCatalog(document.getElementById('pos-search').value);
}

function toggleCameraScanner(target) {
    activeScannerTarget = target;
    const containerId = target === 'pos' ? 'camera-scanner-container-pos' : 'camera-scanner-container-catalog';
    const readerId = target === 'pos' ? 'reader-pos' : 'reader-catalog';

    const container = document.getElementById(containerId);
    if (container.style.display === 'none') {
        container.style.display = 'block';
        html5QrCode = new Html5Qrcode(readerId);
        
        const config = { 
            fps: 15, 
            qrbox: { width: 250, height: 150 },
            formatsToSupport: [ 
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ]
        };

        html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                const cleanScannedCode = decodedText.trim();
                
                if (activeScannerTarget === 'catalog') {
                    document.getElementById('prod-barcode').value = cleanScannedCode;
                } else {
                    const matchedKey = Object.keys(allProducts).find(k => {
                        const p = allProducts[k];
                        return (p.barcode && p.barcode.trim().toLowerCase() === cleanScannedCode.toLowerCase()) ||
                               ((p.code || '').trim().toLowerCase() === cleanScannedCode.toLowerCase());
                    });

                    if (matchedKey) {
                        openQtyModal(matchedKey);
                    } else {
                        document.getElementById('pos-search').value = cleanScannedCode;
                        searchProduct(cleanScannedCode);
                    }
                }
                stopCameraScanner();
            }
        ).catch(err => alert("Error abriendo cámara: " + err));
    } else {
        stopCameraScanner();
    }
}

function stopCameraScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            hideScannerContainers();
        }).catch(() => {
            hideScannerContainers();
        });
    } else {
        hideScannerContainers();
    }
}

function hideScannerContainers() {
    document.getElementById('camera-scanner-container-pos').style.display = 'none';
    document.getElementById('camera-scanner-container-catalog').style.display = 'none';
}

function loadQuoteToCart() {
    const folioInput = document.getElementById('load-quote-folio').value.trim().toUpperCase();
    if (!folioInput) {
        alert("Ingresa un Folio de Cotización.");
        return;
    }

    const sale = allSales[folioInput];
    if (!sale) {
        alert("No se encontró la cotización: " + folioInput);
        return;
    }

    cart = sale.items.map(i => ({ ...i }));
    document.getElementById('client-name').value = sale.client || '';
    renderCart();
    renderPOSCatalog();
    showToast("✅ Cotización " + folioInput + " cargada");
}

function updateCartQty(index, newQty) {
    const qty = parseInt(newQty) || 1;
    cart[index].qty = qty;
    renderCart();
    renderPOSCatalog(document.getElementById('pos-search').value);
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
    renderPOSCatalog(document.getElementById('pos-search').value);
}

function clearCart() {
    cart = [];
    renderCart();
    renderPOSCatalog(document.getElementById('pos-search').value);
}

function renderCart() {
    const tbody = document.getElementById('cart-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalClient = 0;
    let totalCost = 0;
    let totalItems = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.qty;
        const itemCostTotal = item.cost * item.qty;

        totalClient += itemTotal;
        totalCost += itemCostTotal;
        totalItems += item.qty;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.name}</td>
            <td>
                <input type="number" value="${item.qty}" min="1" style="width: 40px;" onchange="updateCartQty(${index}, this.value)">
            </td>
            <td>$${item.price.toFixed(2)}</td>
            <td><b>$${itemTotal.toFixed(2)}</b></td>
            <td><button class="btn btn-danger btn-sm" onclick="removeFromCart(${index})">✕</button></td>
        `;
        tbody.appendChild(tr);
    });

    const netProfit = totalClient - totalCost;
    const marginPercent = totalClient > 0 ? ((netProfit / totalClient) * 100).toFixed(1) : 0;

    document.getElementById('cart-total').innerText = '$' + totalClient.toFixed(2);
    document.getElementById('lbl-costo-total').innerText = '$' + totalCost.toFixed(2);
    document.getElementById('lbl-ganancia-total').innerText = '$' + netProfit.toFixed(2);
    document.getElementById('lbl-margen-porcentaje').innerText = marginPercent + '%';

    const mobileCount = document.getElementById('mobile-cart-count');
    const mobileTotal = document.getElementById('mobile-cart-total');
    if (mobileCount) mobileCount.innerText = totalItems + " piezas";
    if (mobileTotal) mobileTotal.innerText = '$' + totalClient.toFixed(2);
}

// ==========================================
// 4. HISTORIAL Y REPORTES
// ==========================================
function generateNextFolio(type) {
    const prefix = type === 'venta' ? 'VEN-' : 'COT-';
    let maxNum = 0;

    Object.keys(allSales).forEach(folio => {
        if (folio.startsWith(prefix)) {
            const numPart = parseInt(folio.replace(prefix, '')) || 0;
            if (numPart > maxNum) maxNum = numPart;
        }
    });

    const nextNum = maxNum + 1;
    return prefix + nextNum.toString().padStart(5, '0');
}

function generateQuote(type) {
    if (cart.length === 0) {
        alert("El carrito está vacío.");
        return;
    }

    const clientName = document.getElementById('client-name').value.trim() || 'Cliente General / Público';
    const enableExpiry = document.getElementById('enable-expiry').checked;
    const expiryText = enableExpiry ? (document.getElementById('quote-expiry').value.trim() || 'No especificada') : '';

    let totalClient = 0;
    let totalCost = 0;

    cart.forEach(item => {
        totalClient += item.price * item.qty;
        totalCost += item.cost * item.qty;
    });

    const folio = generateNextFolio(type);
    const saleData = {
        folio: folio,
        timestamp: Date.now(),
        date: new Date().toLocaleString(),
        client: clientName,
        type: type,
        items: cart,
        total: totalClient,
        profit: totalClient - totalCost,
        expiry: expiryText,
        status: type === 'venta' ? 'Cobrado' : 'Pendiente'
    };

    allSales[folio] = saleData;
    localStorage.setItem('ferre_sales', JSON.stringify(allSales));

    if (db && navigator.onLine) {
        db.ref("sales/" + folio).set(saleData);
    } else {
        const pendingSales = JSON.parse(localStorage.getItem('ferre_pending_sales')) || [];
        pendingSales.push(saleData);
        localStorage.setItem('ferre_pending_sales', JSON.stringify(pendingSales));
    }

    showModal(saleData);
    cart = [];
    renderCart();
    renderPOSCatalog();
    document.getElementById('client-name').value = '';
}

function parseSaleDate(s) {
    if (s.timestamp) return new Date(s.timestamp);
    if (s.date) {
        const parsed = Date.parse(s.date);
        if (!isNaN(parsed)) return new Date(parsed);
    }
    return null;
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function isSameWeek(d1, d2) {
    const oneDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round(Math.abs((d1 - d2) / oneDay));
    return diffDays <= 7;
}

function isSameMonth(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

function setTimeFilter(filter) {
    currentTimeFilter = filter;
    document.querySelectorAll('#tab-history .filter-time-bar .btn').forEach(b => b.classList.remove('active-time'));
    document.getElementById('btn-time-' + filter).classList.add('active-time');
    renderHistory();
}

function renderHistory() {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const now = new Date();
    const sortedKeys = Object.keys(allSales).reverse();

    sortedKeys.forEach(key => {
        const s = allSales[key];
        const saleDate = parseSaleDate(s);

        if (currentTimeFilter !== 'all') {
            if (!saleDate) return;
            if (currentTimeFilter === 'today' && !isSameDay(now, saleDate)) return;
            if (currentTimeFilter === 'week' && !isSameWeek(now, saleDate)) return;
            if (currentTimeFilter === 'month' && !isSameMonth(now, saleDate)) return;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${s.folio}</b></td>
            <td>${s.client}</td>
            <td><span class="badge">${s.type.toUpperCase()}</span></td>
            <td><b>$${parseFloat(s.total || 0).toFixed(2)}</b></td>
            <td style="font-size:0.75rem;">${s.date}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="reprintSale('${key}')">PDF</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function reprintSale(key) {
    const sale = allSales[key];
    if (sale) showModal(sale);
}

function setReportTimeFilter(filter) {
    currentReportTimeFilter = filter;
    document.querySelectorAll('#tab-reports .filter-time-bar .btn').forEach(b => b.classList.remove('active-time'));
    document.getElementById('btn-rep-' + filter).classList.add('active-time');
    calculateReports();
}

function calculateReports() {
    let totalSales = 0;
    let netProfit = 0;
    const now = new Date();

    Object.keys(allSales).forEach(key => {
        const s = allSales[key];
        const saleDate = parseSaleDate(s);

        if (currentReportTimeFilter !== 'all') {
            if (!saleDate) return;
            if (currentReportTimeFilter === 'today' && !isSameDay(now, saleDate)) return;
            if (currentReportTimeFilter === 'week' && !isSameWeek(now, saleDate)) return;
            if (currentReportTimeFilter === 'month' && !isSameMonth(now, saleDate)) return;
        }

        if (s.status === 'Cobrado' || s.type === 'venta') {
            totalSales += parseFloat(s.total || 0);
            netProfit += parseFloat(s.profit || 0);
        }
    });

    if (document.getElementById('rep-total-sales')) {
        document.getElementById('rep-total-sales').innerText = '$' + totalSales.toFixed(2);
    }
    if (document.getElementById('rep-net-profit')) {
        document.getElementById('rep-net-profit').innerText = '$' + netProfit.toFixed(2);
    }
}

function saveSettings() {
    const bank = {
        name: document.getElementById('bank-name').value.trim(),
        holder: document.getElementById('bank-holder').value.trim(),
        clabe: document.getElementById('bank-clabe').value.trim(),
        account: document.getElementById('bank-account').value.trim()
    };
    const terms = document.getElementById('terms-text').value.trim();

    bankSettings = bank;
    termsSettings = terms;

    localStorage.setItem('ferre_bank', JSON.stringify(bank));
    localStorage.setItem('ferre_terms', terms);

    if (db && navigator.onLine) {
        db.ref("settings").set({ bank, terms });
    }

    showToast("✅ Ajustes guardados");
}

function showModal(sale) {
    const backdrop = document.getElementById('quote-modal-backdrop');
    const container = document.getElementById('quote-modal-content');
    if (!backdrop || !container) return;

    let itemsHtml = '';
    sale.items.forEach(item => {
        itemsHtml += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 6px 0;">${item.name}</td>
                <td style="text-align: center; padding: 6px 0;">${item.qty}</td>
                <td style="text-align: right; padding: 6px 0;">$${item.price.toFixed(2)}</td>
                <td style="text-align: right; padding: 6px 0;">$${(item.price * item.qty).toFixed(2)}</td>
            </tr>
        `;
    });

    let bankHtml = '';
    if (sale.type === 'cotizacion' && bankSettings.clabe) {
        bankHtml = `
            <div style="margin-top: 12px; padding: 8px; border: 1px dashed #bbb; border-radius: 6px; background: #fafafa; font-size: 0.8rem;">
                <h4 style="margin: 0 0 4px 0; color: #333;">Datos para Depósito / Transferencia:</h4>
                <p style="margin: 2px 0;"><b>Banco:</b> ${bankSettings.name || ''}</p>
                <p style="margin: 2px 0;"><b>Titular:</b> ${bankSettings.holder || ''}</p>
                <p style="margin: 2px 0;"><b>CLABE:</b> ${bankSettings.clabe || ''}</p>
                ${bankSettings.account ? `<p style="margin: 2px 0;"><b>Cuenta/Tarjeta:</b> ${bankSettings.account}</p>` : ''}
            </div>
        `;
    }

    let termsHtml = '';
    if (termsSettings) {
        termsHtml = `
            <div style="margin-top: 12px; font-size: 0.75rem; color: #666; border-top: 1px solid #eee; padding-top: 6px;">
                <p style="margin: 0;"><b>Términos:</b> ${termsSettings}</p>
            </div>
        `;
    }

    container.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 12px;">
            <h2 style="margin: 0; font-size: 1.4rem; color: #111;">FERRE-POS</h2>
            <p style="margin: 2px 0 0 0; font-weight: bold; font-size: 0.9rem; color: #444;">
                ${sale.type === 'venta' ? 'RECIBO DE VENTA' : 'COTIZACIÓN DE MATERIALES'}
            </p>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 0.8rem;">
            <div>
                <p style="margin: 2px 0;"><b>Cliente:</b> ${sale.client}</p>
                ${sale.expiry && sale.type === 'cotizacion' ? `<p style="margin: 2px 0; color: #c53030;"><b>Vigencia:</b> ${sale.expiry}</p>` : ''}
            </div>
            <div style="text-align: right;">
                <p style="margin: 2px 0;"><b>Folio:</b> ${sale.folio}</p>
                <p style="margin: 2px 0;"><b>Fecha:</b> ${sale.date}</p>
            </div>
        </div>

        <table style="width:100%; border-collapse: collapse; margin-bottom: 10px; font-size: 0.8rem;">
            <thead>
                <tr style="border-bottom: 2px solid #222; text-align: left;">
                    <th style="padding-bottom: 4px;">Producto</th>
                    <th style="text-align: center; padding-bottom: 4px;">Cant.</th>
                    <th style="text-align: right; padding-bottom: 4px;">Precio U.</th>
                    <th style="text-align: right; padding-bottom: 4px;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>

        <div style="text-align: right; margin-top: 10px; font-size: 1rem;">
            <p style="margin: 0;"><b>Total: <span style="font-size: 1.15rem;">$${parseFloat(sale.total).toFixed(2)}</span> MXN</b></p>
        </div>

        ${bankHtml}
        ${termsHtml}
    `;

    backdrop.style.display = 'flex';
}

function printDocument() {
    const printContent = document.getElementById('quote-modal-content').innerHTML;
    const originalContent = document.body.innerHTML;

    document.body.innerHTML = `
        <div style="width: 100%; max-width: 800px; margin: 0 auto; padding: 15px; font-family: Arial, sans-serif;">
            ${printContent}
        </div>
    `;

    window.print();
    document.body.innerHTML = originalContent;
    location.reload();
}

function closeModal() {
    const backdrop = document.getElementById('quote-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
}

applyDefaultCategoryMargin();
filterCatalogCategory('todos');
renderCatalog();
renderPOSCatalog();
renderHistory();
calculateReports();
