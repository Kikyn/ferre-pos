// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN FIREBASE Y LOCALSTORAGE
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

// ==========================================
// 2. ORDENAMIENTO (A-Z Y MENOR A MAYOR PRECIO)
// ==========================================
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

// ==========================================
// 3. NAVEGACIÓN Y PESTAÑAS
// ==========================================
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

// ==========================================
// 4. CATÁLOGO - CÓDIGO DE PRODUCTO Y CÓDIGO DE BARRAS
// ==========================================
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

    alert(editingKey ? "✅ Producto actualizado" : "✅ Producto guardado");
    cancelEditProduct();
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
    
    const trackStock = p.trackStock !== false && p.stock !== 'N/A';
    document.getElementById('prod-track-stock').checked = trackStock;
    toggleStockField(trackStock);
    document.getElementById('prod-stock').value = trackStock ? p.stock : 10;

    document.getElementById('btn-save-prod').innerText = "Guardar Cambios ✏️";
    document.getElementById('btn-cancel-edit').style.display = "inline-block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEditProduct() {
    document.getElementById('editing-product-key').value = '';
    document.getElementById('catalog-form-title').innerText = "Registrar Nuevo Producto";
    document.getElementById('prod-code-input').value = '';
    document.getElementById('prod-barcode').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-cost').value = '';
    document.getElementById('prod-price').value = '';
    document.getElementById('btn-save-prod').innerText = "Guardar en la Nube ☁️";
    document.getElementById('btn-cancel-edit').style.display = "none";
}

function renderCatalog(filterQuery = '') {
    const tbody = document.getElementById('catalog-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sorted = getSortedProducts(allProducts);
    const q = filterQuery.toLowerCase().trim();

    sorted.forEach(p => {
        const itemCode = (p.code || p.sku || '').toLowerCase();
        const itemBarcode = (p.barcode || '').toLowerCase();
        const itemName = (p.name || '').toLowerCase();

        if (q && !itemCode.includes(q) && !itemBarcode.includes(q) && !itemName.includes(q)) return;

        const profit = (p.price || 0) - (p.cost || 0);
        const tr = document.createElement('tr');
        
        const displayCode = p.barcode ? `<b>${p.code}</b><br><small style="color:#2563eb;">📷 Barras: ${p.barcode}</small>` : `<b>${p.code}</b>`;

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
// 5. PUNTO DE VENTA Y LECTOR DE CÓDIGO DE BARRAS EXACTO
// ==========================================
function renderPOSCatalog(filterQuery = '', categoryFilter = 'todos') {
    const tbody = document.getElementById('pos-catalog-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sorted = getSortedProducts(allProducts);
    const q = filterQuery.toLowerCase().trim();

    sorted.forEach(p => {
        if (categoryFilter !== 'todos' && p.category !== categoryFilter) return;

        const itemCode = (p.code || p.sku || '').toLowerCase();
        const itemBarcode = (p.barcode || '').toLowerCase();
        const itemName = (p.name || '').toLowerCase();

        if (q && !itemCode.includes(q) && !itemBarcode.includes(q) && !itemName.includes(q)) return;

        const displayIdent = p.barcode ? `<b>${p.barcode}</b><br><small style="color:#64748b;">Cod: ${p.code}</small>` : `<b>${p.code}</b>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${displayIdent}</td>
            <td>${p.name}</td>
            <td><b>$${parseFloat(p.price || 0).toFixed(2)}</b></td>
            <td><button class="btn btn-primary btn-sm" onclick="addToCart('${p.key}')">Agregar 🛒</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function searchProduct(query) {
    renderPOSCatalog(query);
}

function filterCategory(cat) {
    renderPOSCatalog(document.getElementById('pos-search').value, cat);
}

function addToCart(key) {
    const product = allProducts[key];
    if (!product) return;

    const existingIndex = cart.findIndex(item => item.key === key);
    if (existingIndex > -1) {
        cart[existingIndex].qty += 1;
    } else {
        cart.push({
            key: key,
            code: product.code,
            name: product.name,
            cost: parseFloat(product.cost || 0),
            price: parseFloat(product.price || 0),
            qty: 1
        });
    }

    renderCart();
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
                    document.getElementById('pos-search').value = cleanScannedCode;
                    searchProduct(cleanScannedCode);
                    
                    const matchedKey = Object.keys(allProducts).find(k => {
                        const p = allProducts[k];
                        return (p.barcode && p.barcode.trim().toLowerCase() === cleanScannedCode.toLowerCase()) ||
                               ((p.code || '').trim().toLowerCase() === cleanScannedCode.toLowerCase());
                    });

                    if (matchedKey) {
                        addToCart(matchedKey);
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
    alert("✅ Cotización " + folioInput + " cargada al carrito.");
}

function updateCartQty(index, newQty) {
    const qty = parseInt(newQty) || 1;
    cart[index].qty = qty;
    renderCart();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function renderCart() {
    const tbody = document.getElementById('cart-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalClient = 0;
    let totalCost = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.qty;
        const itemCostTotal = item.cost * item.qty;

        totalClient += itemTotal;
        totalCost += itemCostTotal;

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
}

// ==========================================
// 6. GENERAR FOLIOS CONSECUTIVOS
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
    document.getElementById('client-name').value = '';
}

// ==========================================
// 7. HISTORIAL
// ==========================================
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
    con
