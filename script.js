// Función para cambiar pestañas
function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.style.display = 'none');
    
    const activeTab = document.getElementById('tab-' + tabName);
    if (activeTab) {
        activeTab.style.display = 'block';
    }

    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.getElementById('btn-' + tabName);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

// Configuración de Firebase
const firebaseConfig = {
    databaseURL: "https://ferre-pos-default-rtdb.firebaseio.com"
};

// Inicializar Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = (typeof firebase !== 'undefined') ? firebase.database() : null;

if (db) {
    const connectedRef = db.ref(".info/connected");
    connectedRef.on("value", (snap) => {
        const statusElem = document.getElementById("cloud-status");
        if (snap.val() === true) {
            if (statusElem) statusElem.innerHTML = "🟢 Nube Conectada";
        } else {
            if (statusElem) statusElem.innerHTML = "🔴 Sin Conexión";
        }
    });
}
