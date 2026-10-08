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
let currentTimeFilter = 'today';
let currentReportTimeFilter = 'today';

// Sincronización Online / Offline
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
// 2. ORDENAMIENTO (A-Z Y DE MENOR A MAYOR PRECIO)
// ==========================================
function getSortedProducts(productsObj) {
    return Object.keys(productsObj)
        .map(key => ({ key: key, ...productsObj[key] }))
        .sort((a, b) => {
            if (a.price !== b.price) {
                return (a.price || 0) - (b.price || 0); // Menor a Mayor
            }
            return (a.name || '').localeCompare(b.name || ''); // A-Z
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
// 4. CATÁLOGO CON BÚSQUEDA Y EDICIÓN
// ==========================================
function saveProduct() {
    const code = document.getElementById('prod-code').value.trim();
    const name = document.getElementById('prod-name').value.trim();
    const category = document.getElementById('prod-category').value;
    const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
    const price = parseFloat(document.getElementById('prod-price').value) || 0;
    const trackStock = document.getElementById('prod-track-stock').checked;
    const stock = trackStock ? (parseInt(document.getElementById('prod-stock').value) || 0) : 'N/A';
    const editingKey = document.getElementById('editing-product-key').value;

    if (!code || !name) {
        alert("⚠️ Ingresa el Código SKU y Nombre del producto.");
        return;
    }

    const cleanCode = code.replace(/[.#$/[\]]/g, "_");
    const newProduct = { code, name, category, cost, price, trackStock, stock };

    if (editingKey && editingKey !== cleanCode) {
        delete allProducts[editingKey];
        if (db) db.ref("products/" + editingKey).remove();
    }

    allProducts[cleanCode] = newProduct;
    localStorage.setItem('ferre_products', JSON.stringify(allProducts));

    if (db && navigator.onLine) {
        db.ref("products/" + cleanCode).set(newProduct);
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
    document.getElementById('catalog-form-title').innerText = "✏️ Modificar Producto: " + p.name;
    document.getElementById('prod-code').value = p.code || '';
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
    document.getElementById('prod-code').value = '';
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
        if (q && !p.code.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return;

        const profit = (p.price || 0) - (p.cost || 0);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${p.code}</b></td>
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
// 5. PUNTO DE VENTA Y ESCÁNER DE CÁMARA
// ==========================================
function renderPOSCatalog(filterQuery = '', categoryFilter = 'todos') {
    const tbody = document.getElementById('pos-catalog-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sorted = getSortedProducts(allProducts);
    const q = filterQuery.toLowerCase().trim();

    sorted.forEach(p => {
        if (categoryFilter !== 'todos' && p.category !== categoryFilter) return;
        if (q && !p.code.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.code}</td>
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

// Lectura de Código por Cámara
function toggleCameraScanner() {
    const container = document.getElementById('camera-scanner-container');
    if (container.style.display === 'none') {
        container.style.display = 'block';
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 250 },
            (decodedText) => {
                document.getElementById('pos-search').value = decodedText;
                searchProduct(decodedText);
                
                // Si coincide exacto con un SKU, agregarlo directo
                const matchedKey = Object.keys(allProducts).find(k => allProducts[k].code.toLowerCase() === decodedText.toLowerCase());
                if (matchedKey) {
                    addToCart(matchedKey);
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
            document.getElementById('camera-scanner-container').style.display = 'none';
        }).catch(() => {
            document.getElementById('camera-scanner-container').style.display = 'none';
        });
    }
}

// Cargador de Cotización previa a Venta
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
                <input type="number" value="${item.qty}" min="1" style="width: 45px;" onchange="updateCartQty(${index}, this.value)">
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
// 6. GENERAR FOLIOS CONSECUTIVOS (`COT-00001` Y `VEN-00001`)
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
// 7. HISTORIAL CON FILTROS POR FECHAS (HOY / SEMANA / MES)
// ==========================================
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
    document.querySelectorAll('.filter-time-bar .btn').forEach(b => b.classList.remove('active-time'));
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
        const saleDate = new Date(s.timestamp || Date.now());

        if (currentTimeFilter === 'today' && !isSameDay(now, saleDate)) return;
        if (currentTimeFilter === 'week' && !isSameWeek(now, saleDate)) return;
        if (currentTimeFilter === 'month' && !isSameMonth(now, saleDate)) return;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${s.folio}</b></td>
            <td>${s.client}</td>
            <td><span class="badge">${s.type.toUpperCase()}</span></td>
            <td><b>$${parseFloat(s.total || 0).toFixed(2)}</b></td>
            <td style="color: var(--success); font-weight: bold;">$${parseFloat(s.profit || 0).toFixed(2)}</td>
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

// ==========================================
// 8. REPORTES Y GANANCIAS
// ==========================================
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
        const saleDate = new Date(s.timestamp || Date.now());

        if (currentReportTimeFilter === 'today' && !isSameDay(now, saleDate)) return;
        if (currentReportTimeFilter === 'week' && !isSameWeek(now, saleDate)) return;
        if (currentReportTimeFilter === 'month' && !isSameMonth(now, saleDate)) return;

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

// ==========================================
// 9. CONFIGURACIÓN Y MODAL IMPRESIÓN
// ==========================================
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

    alert("✅ Configuración guardada correctamente.");
}

function showModal(sale) {
    const backdrop = document.getElementById('quote-modal-backdrop');
    const container = document.getElementById('quote-modal-content');
    if (!backdrop || !container) return;

    let itemsHtml = '';
    sale.items.forEach(item => {
        itemsHtml += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;">${item.name}</td>
                <td style="text-align: center; padding: 8px 0;">${item.qty}</td>
                <td style="text-align: right; padding: 8px 0;">$${item.price.toFixed(2)}</td>
                <td style="text-align: right; padding: 8px 0;">$${(item.price * item.qty).toFixed(2)}</td>
            </tr>
        `;
    });

    let bankHtml = '';
    if (sale.type === 'cotizacion' && bankSettings.clabe) {
        bankHtml = `
            <div style="margin-top: 15px; padding: 10px; border: 1px dashed #bbb; border-radius: 6px; background: #fafafa; font-size: 0.85rem;">
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
            <div style="margin-top: 15px; font-size: 0.75rem; color: #666; border-top: 1px solid #eee; padding-top: 8px;">
                <p style="margin: 0;"><b>Términos:</b> ${termsSettings}</p>
            </div>
        `;
    }

    container.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 15px;">
            <h2 style="margin: 0; font-size: 1.5rem; color: #111;">FERRE-POS</h2>
            <p style="margin: 2px 0 0 0; font-weight: bold; font-size: 0.95rem; color: #444;">
                ${sale.type === 'venta' ? 'RECIBO DE VENTA' : 'COTIZACIÓN DE MATERIALES'}
            </p>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 0.85rem;">
            <div>
                <p style="margin: 2px 0;"><b>Cliente:</b> ${sale.client}</p>
                ${sale.expiry && sale.type === 'cotizacion' ? `<p style="margin: 2px 0; color: #c53030;"><b>Vigencia:</b> ${sale.expiry}</p>` : ''}
            </div>
            <div style="text-align: right;">
                <p style="margin: 2px 0;"><b>Folio:</b> ${sale.folio}</p>
                <p style="margin: 2px 0;"><b>Fecha:</b> ${sale.date}</p>
            </div>
        </div>

        <table style="width:100%; border-collapse: collapse; margin-bottom: 12px; font-size: 0.85rem;">
            <thead>
                <tr style="border-bottom: 2px solid #222; text-align: left;">
                    <th style="padding-bottom: 6px;">Producto</th>
                    <th style="text-align: center; padding-bottom: 6px;">Cant.</th>
                    <th style="text-align: right; padding-bottom: 6px;">Precio U.</th>
                    <th style="text-align: right; padding-bottom: 6px;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>

        <div style="text-align: right; margin-top: 12px; font-size: 1.05rem;">
            <p style="margin: 0;"><b>Total: <span style="font-size: 1.2rem;">$${parseFloat(sale.total).toFixed(2)}</span> MXN</b></p>
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
        <div style="width: 100%; max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
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

// Carga Inicial
renderCatalog();
renderPOSCatalog();
renderHistory();
calculateReports();
