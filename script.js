// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN FIREBASE
// ==========================================
const firebaseConfig = {
    databaseURL: "https://ferre-pos-default-rtdb.firebaseio.com"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = (typeof firebase !== 'undefined') ? firebase.database() : null;

let allProducts = {};
let cart = [];

if (db) {
    db.ref(".info/connected").on("value", (snap) => {
        const statusElem = document.getElementById("cloud-status");
        if (statusElem) {
            statusElem.innerHTML = snap.val() === true ? "🟢 Nube Conectada" : "🔴 Sin Conexión";
        }
    });

    db.ref("products").on("value", (snapshot) => {
        allProducts = snapshot.val() || {};
        renderCatalog(allProducts);
        renderPOSCatalog(allProducts);
    });

    db.ref("sales").on("value", (snapshot) => {
        const sales = snapshot.val() || {};
        renderHistory(sales);
        calculateReports(sales);
    });

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
        type: type,
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

function reprintSale(key) {
    if (db) {
        db.ref("sales/" + key).once("value", (snapshot) => {
            const sale = snapshot.val();
            if (sale) showModal(sale);
        });
    }
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
// 7. DATOS BANCARIOS Y MOSTRAR IMPRESIÓN
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
    const backdrop = document.getElementById('quote-modal-backdrop');
    const container = document.getElementById('quote-modal-content');
    if (!backdrop || !container) return;

    const bankName = document.getElementById('bank-name') ? document.getElementById('bank-name').value : '';
    const bankHolder = document.getElementById('bank-holder') ? document.getElementById('bank-holder').value : '';
    const bankClabe = document.getElementById('bank-clabe') ? document.getElementById('bank-clabe').value : '';

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
    if (bankClabe) {
        bankHtml = `
            <div style="margin-top: 20px; padding: 12px; border: 1px dashed #bbb; border-radius: 6px; background: #fafafa;">
                <h4 style="margin: 0 0 6px 0; color: #333; font-size: 0.9rem;">Datos para Transferencia / Depósito:</h4>
                <p style="margin: 2px 0; font-size: 0.85rem;"><b>Banco:</b> ${bankName}</p>
                <p style="margin: 2px 0; font-size: 0.85rem;"><b>Titular:</b> ${bankHolder}</p>
                <p style="margin: 2px 0; font-size: 0.85rem;"><b>CLABE:</b> ${bankClabe}</p>
            </div>
        `;
    }

    container.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 18px;">
            <h2 style="margin: 0; font-size: 1.6rem; color: #111;">FERRE-POS</h2>
            <p style="margin: 4px 0 0 0; font-weight: bold; font-size: 1rem; letter-spacing: 1px; color: #444;">
                ${sale.type === 'venta' ? 'RECIBO DE VENTA' : 'COTIZACIÓN DE MATERIALES'}
            </p>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 18px; font-size: 0.9rem;">
            <div>
                <p style="margin: 3px 0;"><b>Cliente:</b> ${sale.client}</p>
                ${sale.expiry ? `<p style="margin: 3px 0; color: #c53030;"><b>Vigencia:</b> ${sale.expiry}</p>` : ''}
            </div>
            <div style="text-align: right;">
                <p style="margin: 3px 0;"><b>Folio:</b> ${sale.folio}</p>
                <p style="margin: 3px 0;"><b>Fecha:</b> ${sale.date}</p>
            </div>
        </div>

        <table style="width:100%; border-collapse: collapse; margin-bottom: 15px; font-size: 0.9rem;">
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

        <div style="text-align: right; margin-top: 15px; font-size: 1.1rem;">
            <p style="margin: 0;"><b>Total a Pagar: <span style="font-size: 1.3rem;">$${parseFloat(sale.total).toFixed(2)}</span> MXN</b></p>
        </div>

        ${bankHtml}
    `;

    backdrop.style.display = 'flex';
}

function closeModal() {
    const backdrop = document.getElementById('quote-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
}
