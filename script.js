// CONFIGURACIÓN DE FIREBASE PARA SINCRONIZACIÓN EN LA NUBE
const firebaseConfig = {
    databaseURL: "https://ferre-pos-default-rtdb.firebaseio.com/"
};

// Inicializar Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ESTADOS LOCALES DE CACHÉ
let products = [];
let cart = [];
let history = [];
let bankData = {
    bank: 'BBVA',
    holder: 'Mi Nombre Completo',
    clabe: '012345678901234567',
    account: '1234567890'
};

// AL CARGAR LA PÁGINA: ESCUCHAR CAMBIOS EN LA NUBE EN TIEMPO REAL
document.addEventListener('DOMContentLoaded', function() {
    
    // Escuchar catálogo en vivo
    db.ref('products').on('value', (snapshot) => {
        const data = snapshot.val();
        products = data ? Object.values(data) : [];
        renderCatalog();
        renderPOSCatalog();
        const statusEl = document.getElementById('cloud-status');
        if (statusEl) statusEl.innerText = '🟢 Nube Conectada';
    });

    // Escuchar historial de ventas en vivo
    db.ref('history').on('value', (snapshot) => {
        const data = snapshot.val();
        history = data ? Object.values(data) : [];
        renderHistory();
        calculateReports();
    });

    // Escuchar datos bancarios en vivo
    db.ref('bankData').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            bankData = data;
            loadBankSettings();
        }
    });
});

function normalizeText(text) {
    return String(text || '').toLowerCase().trim();
}

// NAVEGACIÓN
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById('tab-' + tabId);
    const targetBtn = document.getElementById('btn-' + tabId);
    
    if (targetTab) targetTab.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');
}

function toggleStockField(checked) {
    const el = document.getElementById('stock-field-container');
    if (el) el.style.display = checked ? 'block' : 'none';
}

function toggleExpiryInput(checked) {
    const el = document.getElementById('expiry-container');
    if (el) el.style.display = checked ? 'block' : 'none';
}

// GUARDAR PRODUCTO EN LA NUBE DESDE COMPUTADORA O CELULAR
function saveProduct() {
    const code = document.getElementById('prod-code').value.trim();
    const name = document.getElementById('prod-name').value.trim();
    const category = document.getElementById('prod-category').value;
    const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
    const price = parseFloat(document.getElementById('prod-price').value) || 0;
    const trackStock = document.getElementById('prod-track-stock').checked;
    const stock = parseInt(document.getElementById('prod-stock').value) || 0;

    if(!code || !name) {
        alert('Por favor ingresa un código y un nombre para el producto.');
        return;
    }

    const prodId = 'PROD-' + Date.now();
    const newProd = {
        id: prodId,
        code,
        name,
        category,
        cost,
        price,
        trackStock,
        stock
    };

    // Guardar directo en Firebase Realtime Database
    db.ref('products/' + prodId).set(newProd, (error) => {
        if (!error) {
            document.getElementById('prod-code').value = '';
            document.getElementById('prod-name').value = '';
            document.getElementById('prod-cost').value = '';
            document.getElementById('prod-price').value = '';
            alert('☁️ Producto guardado en la Nube con éxito. ¡Ya está visible en todos tus dispositivos!');
        } else {
            alert('Error al guardar en la nube: ' + error.message);
        }
    });
}

function renderCatalog() {
    const tbody = document.getElementById('catalog-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    products.forEach(p => {
        const margin = p.price - p.cost