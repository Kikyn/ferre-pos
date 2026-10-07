// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN FIREBASE
// ==========================================
const firebaseConfig = {
    databaseURL: "https://ferre-pos-default-rtdb.firebaseio.com"
};

// Inicializar la librería de Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = (typeof firebase !== 'undefined') ? firebase.database() : null;

// Variables Globales
let allProducts = {};
let cart = [];

// Escuchar estado de la conexión en tiempo real
if (db) {
    db.ref(".info/connected").on("value", (snap) => {
        const statusElem = document.getElementById("cloud-status");
        if (statusElem) {
            statusElem.innerHTML = snap.val() === true ? "🟢 Nube Conectada" : "🔴 Sin Conexión";
        }
    });

    // Escuchar el catálogo de productos en tiempo real
    db.ref("products").on("value", (snapshot) => {
        allProducts = snapshot.val() || {};
        renderCatalog(allProducts);
        renderPOSCatalog(allProducts);
    });

    // Escuchar historial de ventas
    db.ref("sales").on("value", (snapshot) => {
        const sales = snapshot.val() || {};
        renderHistory(sales);
        calculateReports(sales);
    });

    // Cargar datos bancarios al iniciar
    db.ref("settings/bank").once("value", (snapshot) => {
        const bankData = snapshot.val();
        if (bankData) {
            if (document.getElementById('bank-name')) document.getElementById('bank-name').value = bankData.name || '';
            if (document.getElementById('bank-holder')) document.getElementById('bank-holder').value = bankData.holder || '';
            if (document.getElementById('bank-clabe')) document.getElementById('bank-clabe').value = bankData.clabe || '';
            if (document.getElementById('bank-account')) document.getElementById('bank-account').value = bankData.account || '';
        }
    });
}

// ==========================================
// 2. NAVEGACIÓN Y PESTAÑAS
// ==========================================
function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.style.display = 'none');
    
    const activeTab = document.getElementById('tab-' + tabName);
    if (activeTab) activeTab.style.display = 'block';

    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    
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
// 3. GESTIÓN DEL CATÁLOGO DE PRODUCTOS
// ==========================================
function saveProduct() {
    const code = document.getElementById('prod-code').value.trim();
    const name = document.getElementById('prod-name').value.trim();
    const category = document.getElementById('prod-category').value;
    const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
    const price = parseFloat(document.getElementById('prod-price').value) || 0;
    const trackStock = document.getElementById('prod-track-stock').checked;
    const stock = trackStock ? (parseInt(document.getElementById('prod-stock').value) || 0) : 'N/A';

    if (!code || !name) {
        alert("⚠️ Por favor ingresa el Código SKU y el Nombre del producto.");
        return;
    }

    if (!db) {
        alert("Error: No hay conexión con la base de datos.");
        return;
    }

    const cleanCode = code.replace(/[.#$/[\]]/g, "_");

    const newProduct = {
        code: code,
        name: name,
        category: category,
        cost: cost,
        price: price,
        trackStock: trackStock,
        stock: stock
    };

    db.ref("products/" + cleanCode).set(newProduct, (error) => {
        if (error) {
            alert("Error al guardar: " + error.message);
        } else {
            alert("✅ Producto guardado correctamente en la nube");
            document.getElementById('prod-code').value = '';
            document.getElementById('prod-name').value = '';
            document.getElementById('prod-cost').value = '';
            document.getElementById('prod-price').value = '';
        }
    });
}

function renderCatalog(products) {
    const tbody = document.getElementById('catalog-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    Object.keys(products).forEach(key => {
        const p = products[key];
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
            <td><button class="btn btn-danger btn-sm" onclick="deleteProduct('${key}')">Eliminar</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteProduct(key) {
    if (confirm("¿Estás seguro de eliminar este producto de la nube?")) {
        db.ref("products/" + key).remove();
    }
}

// ==========================================
// 4. PUNTO DE VENTA Y CARRITO (POS)
// ==========================================
function renderPOSCatalog(products) {
    const tbody = document.getElementById('pos-catalog-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    Object.keys(products).forEach(key => {
        const p = products[key];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.code}</td>
            <td>${p.name}</td>
            <td><b>$${parseFloat(p.price || 0).toFixed(2)}</b></td>
            <td><button class="btn btn-primary btn-sm" onclick="addToCart('${key}')">Agregar 🛒</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function searchProduct(query) {
    const q = query.toLowerCase().trim();
    const filtered = {};

    Object.keys(allProducts).forEach(key => {
        const p = allProducts[key];
        if (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) {
            filtered[key] = p;
        }
    });

    renderPOSCatalog(filtered);
}

function filterCategory(cat) {
    if (cat === 'todos') {
        renderPOSCatalog(allProducts);
        return;
    }

    const filtered = {};
    Object.keys(allProducts).forEach(key => {
        const p = allProducts[key];
        if (p.category === cat) {
            filtered[key] = p;
        }
    });

    renderPOSCatalog(filtered);
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
                <input type="number" value="${item.qty}" min="1" style="width: 50px;" onchange="updateCartQty(${index}, this.value)">
            </td>
            <td>$${item.price.toFixed(2)}</td>
            <td><b>$${itemTotal.toFixed(2)}</b></td>
            <td><button class="btn btn-danger btn-sm" onclick="removeFromCart(${index})">✕</button></td>
        `;
        tbody.appendChild(tr);
    });

    const netProfit = totalClient - totalCost;
    const marginPercent = totalClient > 0 ? ((netProfit / totalClient) * 100).toFixed(1) : 0;

    // Actualizar Totales Públicos y Privados
    document.getElementById('cart-total').innerText = '$' + totalClient.toFixed(2);
    document.getElementById('lbl-costo-total').innerText = '$' + totalCost.toFixed(2);
    document.getElementById('lbl-ganancia-total').innerText = '$' + netProfit.toFixed(2);
    document.getElementById('lbl-margen-porcentaje').innerText = marginPercent + '%';
}

// ==========================================
// 5. REGISTRAR VENTAS Y COTIZACIONES
// ==========================================
function generateQuote(type) {
    if (cart.length === 0) {
        alert("El carrito está vacío. Agrega productos antes de generar el documento.");
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

    const saleData = {
        folio: 'FOL-' + Date.now().toString().slice(-6),
        date: new Date().toLocaleString(),
        client: clientName,
        type: type, // 'cotizacion' o 'venta'
        items: cart,
        total: totalClient,
        profit: totalClient - totalCost,
        expiry: expiryText,
        status: type === 'venta' ? 'Cobrado' : 'Pendiente'
    };

    if (db) {
        db.ref("sales/" + saleData.folio).set(saleData, (error) => {
            if (error) {
                alert("Error al registrar en la nube: " + error.message);
            } else {
                showModal(saleData);
                cart = [];
                renderCart();
                document.getElementById('client-name').value = '';
            }
        });
    }
}

// ==========================================
// 6. HISTORIAL Y GANANCIAS
// ==========================================
function renderHistory(sales) {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    Object.keys(sales).reverse().forEach(key => {
        const s = sales[key];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${s.folio}</b></td>
            <td>${s.client}</td>
            <td><span class="badge">${s.type.toUpperCase()}</span></td>
            <td><b>$${parseFloat(s.total || 0).toFixed(2)}</b></td>
            <td style="color: var(--success); font-weight: bold;">$${parseFloat(s.profit || 0).toFixed(2)}</td>
            <td>${s.status}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="reprintSale('${key}')">Ver PDF</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function calculateReports(sales) {
    let totalSales = 0;
    let netProfit = 0;

    Object.keys(sales).forEach(key => {
        const s = sales[key];
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
// 7. DATOS BANCARIOS Y IMPRESIÓN
// ==========================================
function saveBankSettings() {
    const name = document.getElementById('bank-name').value.trim();
    const holder = document.getElementById('bank-holder').value.trim();
    const clabe = document.getElementById('bank-clabe').value.trim();
    const account = document.getElementById('bank-account').value.trim();

    if (!db) return;

    db.ref("settings/bank").set({
        name: name,
        holder: holder,
        clabe: clabe,
        account: account
    }, (error) => {
        if (error) {
            alert("Error al guardar datos bancarios: " + error.message);
        } else {
            alert("✅ Datos bancarios guardados con éxito.");
        }
    });
}

function showModal(sale) {
    const modal = document.getElementById('quote-modal');
    const container = document.getElementById('quote-modal-content');
    if (!modal || !container) return;

    let itemsHtml = '';
    sale.items.forEach(item => {
        itemsHtml += `
            <tr>
                <td>${item.name}</td>
                <td>${item.qty}</td>
                <td>$${item.price.toFixed(2)}</td>
                <td>$${(item.price * item.qty).toFixed(2)}</td>
            </tr>
        `;
    });

    container.innerHTML = `
        <h3>${sale.type === 'venta' ? 'RECIBO DE VENTA' : 'COTIZACIÓN DE MATERIALES'}</h3>
        <p><b>Folio:</b> ${sale.folio} | <b>Fecha:</b> ${sale.date}</p>
        <p><b>Cliente:</b> ${sale.client}</p>
        ${sale.expiry ? `<p><b>Vigencia:</b> ${sale.expiry}</p>` : ''}
        <hr>
        <table style="width:100%; border-collapse: collapse; margin-bottom: 15px;">
            <thead>
                <tr style="border-bottom: 1px solid #ccc; text-align: left;">
                    <th>Producto</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <h3 style="text-align: right;">Total: $${parseFloat(sale.total).toFixed(2)}</h3>
    `;

    modal.style.display = 'block';
}

function closeModal() {
    const modal = document.getElementById('quote-modal');
    if (modal) modal.style.display = 'none';
}
