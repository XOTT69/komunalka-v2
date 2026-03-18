import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBgRHmaHjg23BIZjJdCucwnmMFDX57XP80",
  authDomain: "pwakomun.firebaseapp.com",
  projectId: "pwakomun",
  storageBucket: "pwakomun.firebasestorage.app",
  messagingSenderId: "4437974770",
  appId: "1:4437974770:web:b4fd86b8ba9ab062707a6b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const monthInput = document.getElementById('record-month');
let currentUser = null;
let pastReadings = null; 

// Дефолтні налаштування (завжди існують)
let SETTINGS = {
    tariffs: { electro: 4.32, electroNight: 2.16, water: 30.38, gas: 7.96 },
    features: { twoZone: false, winterTariff: false, showWater: true, showGas: true, showHeating: true, showGarbage: true, showInternet: true },
    reminders: { electro: "1-5", water: "1-5", gas: "1-5" }
};

// --- ІНІЦІАЛІЗАЦІЯ ДАТИ ---
function initDate() {
    const today = new Date();
    monthInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}
initDate();
monthInput.addEventListener('change', updateAppUI);

// --- АВТОРИЗАЦІЯ ---
document.getElementById('login-btn').addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()));
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('user-avatar').textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';
        
        await loadUserSettings();
        updateAppUI();
        requestNotificationPermission();
    } else {
        currentUser = null;
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }
});

// --- НАВІГАЦІЯ ---
const navButtons = document.querySelectorAll('.nav-btn');
const tabs = { 'tab-input': document.getElementById('tab-input'), 'tab-history': document.getElementById('tab-history'), 'tab-settings': document.getElementById('tab-settings') };

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        navButtons.forEach(b => { b.classList.remove('text-blue-600', 'bg-blue-50'); b.classList.add('text-gray-400'); });
        Object.values(tabs).forEach(tab => tab.classList.add('hidden'));
        
        btn.classList.add('text-blue-600', 'bg-blue-50');
        btn.classList.remove('text-gray-400');
        const targetId = btn.getAttribute('data-target');
        tabs[targetId].classList.remove('hidden');

        if (targetId === 'tab-history') loadHistory();
        if (targetId === 'tab-input') updateAppUI();
    });
});

// --- ЛОГІКА НАЛАШТУВАНЬ ТА РЕНДЕРУ UI ---
async function loadUserSettings() {
    try {
        const snap = await getDoc(doc(db, "settings", currentUser.uid));
        if (snap.exists()) {
            const dbSettings = snap.data();
            SETTINGS.tariffs = { ...SETTINGS.tariffs, ...(dbSettings.tariffs || {}) };
            SETTINGS.features = { ...SETTINGS.features, ...(dbSettings.features || {}) };
            SETTINGS.reminders = { ...SETTINGS.reminders, ...(dbSettings.reminders || {}) };
        }
        populateSettingsForm();
        renderInputsBasedOnSettings();
    } catch (e) { console.error("Load settings error:", e); }
}

function populateSettingsForm() {
    document.getElementById('tariff-electro').value = SETTINGS.tariffs.electro;
    document.getElementById('tariff-electro-night').value = SETTINGS.tariffs.electroNight;
    document.getElementById('tariff-water').value = SETTINGS.tariffs.water;
    document.getElementById('tariff-gas').value = SETTINGS.tariffs.gas;

    document.getElementById('setting-twozone').checked = SETTINGS.features.twoZone;
    document.getElementById('setting-winter').checked = SETTINGS.features.winterTariff;
    document.getElementById('show-water').checked = SETTINGS.features.showWater;
    document.getElementById('show-gas').checked = SETTINGS.features.showGas;
    document.getElementById('show-heating').checked = SETTINGS.features.showHeating;
    document.getElementById('show-garbage').checked = SETTINGS.features.showGarbage;
    document.getElementById('show-internet').checked = SETTINGS.features.showInternet;

    document.getElementById('remind-electro').value = SETTINGS.reminders.electro;
    document.getElementById('remind-water').value = SETTINGS.reminders.water;
    document.getElementById('remind-gas').value = SETTINGS.reminders.gas;

    toggleNightTariffInput();
}

document.getElementById('setting-twozone').addEventListener('change', toggleNightTariffInput);
function toggleNightTariffInput() {
    const isChecked = document.getElementById('setting-twozone').checked;
    const container = document.getElementById('night-tariff-container');
    if (isChecked) { container.classList.remove('opacity-50', 'pointer-events-none'); } 
    else { container.classList.add('opacity-50', 'pointer-events-none'); }
}

document.getElementById('save-settings-btn').addEventListener('click', async () => {
    if (!currentUser) return;
    const btn = document.getElementById('save-settings-btn');
    
    // Збираємо нові дані
    const newSettings = {
        tariffs: {
            electro: Number(document.getElementById('tariff-electro').value) || 0,
            electroNight: Number(document.getElementById('tariff-electro-night').value) || 0,
            water: Number(document.getElementById('tariff-water').value) || 0,
            gas: Number(document.getElementById('tariff-gas').value) || 0
        },
        features: {
            twoZone: document.getElementById('setting-twozone').checked,
            winterTariff: document.getElementById('setting-winter').checked,
            showWater: document.getElementById('show-water').checked,
            showGas: document.getElementById('show-gas').checked,
            showHeating: document.getElementById('show-heating').checked,
            showGarbage: document.getElementById('show-garbage').checked,
            showInternet: document.getElementById('show-internet').checked
        },
        reminders: {
            electro: document.getElementById('remind-electro').value || "",
            water: document.getElementById('remind-water').value || "",
            gas: document.getElementById('remind-gas').value || ""
        }
    };

    try {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Зберігаємо...';
        btn.disabled = true;

        // НАДІЙНЕ ЗБЕРЕЖЕННЯ (Створить або оновить)
        await setDoc(doc(db, "settings", currentUser.uid), newSettings, { merge: true });
        SETTINGS = newSettings; // Оновлюємо локально
        
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Збережено!';
        btn.classList.replace('bg-gray-900', 'bg-green-500');
        renderInputsBasedOnSettings();
        updateAppUI();
        
        setTimeout(() => { 
            btn.innerHTML = 'Зберегти налаштування'; 
            btn.classList.replace('bg-green-500', 'bg-gray-900'); 
            btn.disabled = false;
        }, 2000);
    } catch (e) { 
        console.error("Save settings error:", e);
        alert("Помилка збереження. Перевірте з'єднання."); 
        btn.innerHTML = 'Зберегти налаштування'; 
        btn.disabled = false;
    }
});

function renderInputsBasedOnSettings() {
    // Електро
    document.getElementById('block-electro').classList.remove('hidden');
    if (SETTINGS.features.twoZone) {
        document.getElementById('electro-single-input').classList.add('hidden');
        document.getElementById('electro-twozone-inputs').classList.remove('hidden');
    } else {
        document.getElementById('electro-single-input').classList.remove('hidden');
        document.getElementById('electro-twozone-inputs').classList.add('hidden');
    }

    // Інші блоки
    document.getElementById('block-water').style.display = SETTINGS.features.showWater ? 'block' : 'none';
    document.getElementById('block-gas').style.display = SETTINGS.features.showGas ? 'block' : 'none';
    
    document.getElementById('block-heating').style.display = SETTINGS.features.showHeating ? 'block' : 'none';
    document.getElementById('block-garbage').style.display = SETTINGS.features.showGarbage ? 'block' : 'none';
    document.getElementById('block-internet').style.display = SETTINGS.features.showInternet ? 'block' : 'none';
    
    // Ховаємо весь блок фіксованих послуг, якщо вони всі вимкнені
    const fixedContainer = document.getElementById('fixed-services-container');
    if (!SETTINGS.features.showHeating && !SETTINGS.features.showGarbage && !SETTINGS.features.showInternet) {
        fixedContainer.style.display = 'none';
    } else {
        fixedContainer.style.display = 'block';
    }
}

// --- ОТРИМАННЯ ТА РОЗРАХУНОК ДАНИХ ---
async function getUserRecords() {
    try {
        const snapshot = await getDocs(query(collection(db, "utilities"), where("userId", "==", currentUser.uid)));
        let records = [];
        snapshot.forEach(d => records.push(d.data()));
        records.sort((a, b) => b.date.localeCompare(a.date));
        return records;
    } catch (e) { return []; }
}

async function updateAppUI() {
    if (!currentUser) return;
    const selectedDate = monthInput.value; 
    const records = await getUserRecords();
    pastReadings = records.find(r => r.date < selectedDate) || null;
    
    const prevText = pastReadings ? `Попередній (${formatMonthUI(pastReadings.date)}): ` : "Попередній: Немає ";
    
    document.getElementById('last-electro').textContent = prevText + (pastReadings ? (pastReadings.electroReading || 0) : "");
    document.getElementById('last-electro-day').textContent = prevText + (pastReadings ? (pastReadings.electroDayReading || 0) : "");
    document.getElementById('last-electro-night').textContent = prevText + (pastReadings ? (pastReadings.electroNightReading || 0) : "");
    document.getElementById('last-water').textContent = prevText + (pastReadings ? (pastReadings.waterReading || 0) : "");
    document.getElementById('last-gas').textContent = prevText + (pastReadings ? (pastReadings.gasReading || 0) : "");

    calculateForecast(records);
    checkReminders();
}

// --- МАТЕМАТИКА ТА ЗБЕРЕЖЕННЯ ---
document.getElementById('save-btn').addEventListener('click', async () => {
    if (!currentUser) return;
    const selectedDate = monthInput.value;
    if (!selectedDate) return;

    let electroReading = 0, electroDayReading = 0, electroNightReading = 0;
    
    if (SETTINGS.features.twoZone) {
        electroDayReading = Number(document.getElementById('electro-day-reading').value) || 0;
        electroNightReading = Number(document.getElementById('electro-night-reading').value) || 0;
    } else {
        electroReading = Number(document.getElementById('electro-reading').value) || 0;
    }

    const waterReading = Number(document.getElementById('water-reading').value) || 0;
    const gasReading = Number(document.getElementById('gas-reading').value) || 0;

    const consumedElectro = SETTINGS.features.twoZone ? 0 : (pastReadings && electroReading > 0 ? Math.max(0, electroReading - (pastReadings.electroReading||0)) : 0);
    const consumedElectroDay = SETTINGS.features.twoZone ? (pastReadings && electroDayReading > 0 ? Math.max(0, electroDayReading - (pastReadings.electroDayReading||0)) : 0) : 0;
    const consumedElectroNight = SETTINGS.features.twoZone ? (pastReadings && electroNightReading > 0 ? Math.max(0, electroNightReading - (pastReadings.electroNightReading||0)) : 0) : 0;
    const consumedWater = pastReadings && waterReading > 0 ? Math.max(0, waterReading - (pastReadings.waterReading||0)) : 0;
    const consumedGas = pastReadings && gasReading > 0 ? Math.max(0, gasReading - (pastReadings.gasReading||0)) : 0;

    const data = {
        userId: currentUser.uid,
        date: selectedDate,
        
        electro: consumedElectro, electroDay: consumedElectroDay, electroNight: consumedElectroNight,
        water: consumedWater, gas: consumedGas,
        
        electroReading: electroReading > 0 ? electroReading : (pastReadings ? pastReadings.electroReading||0 : 0),
        electroDayReading: electroDayReading > 0 ? electroDayReading : (pastReadings ? pastReadings.electroDayReading||0 : 0),
        electroNightReading: electroNightReading > 0 ? electroNightReading : (pastReadings ? pastReadings.electroNightReading||0 : 0),
        waterReading: waterReading > 0 ? waterReading : (pastReadings ? pastReadings.waterReading||0 : 0),
        gasReading: gasReading > 0 ? gasReading : (pastReadings ? pastReadings.gasReading||0 : 0),
        
        heating: Number(document.getElementById('heating').value) || 0,
        garbage: Number(document.getElementById('garbage').value) || 0,
        internet: Number(document.getElementById('internet').value) || 0,
    };

    try {
        const btn = document.getElementById('save-btn');
        btn.textContent = "Зберігаємо..."; btn.disabled = true;
        await setDoc(doc(db, "utilities", `${currentUser.uid}_${selectedDate}`), data, { merge: true });
        btn.textContent = "Збережено!"; btn.classList.replace('bg-blue-600', 'bg-green-500');
        document.querySelectorAll('#tab-input input[type="number"]').forEach(i => i.value = '');
        setTimeout(() => { btn.textContent = "Зберегти дані"; btn.classList.replace('bg-green-500', 'bg-blue-600'); btn.disabled = false; }, 2000);
        updateAppUI();
    } catch (e) { alert("Помилка бази даних."); }
});

// --- ІСТОРІЯ ТА РОЗРАХУНОК СУМИ ---
function isWinterMonth(dateStr) {
    const month = parseInt(dateStr.split('-')[1], 10);
    return month >= 10 || month <= 4; 
}

function calculateCostForRecord(r) {
    let electroCost = 0;
    const isWinter = SETTINGS.features.winterTariff && isWinterMonth(r.date);
    const baseTariff = SETTINGS.tariffs.electro;
    const nightTariff = SETTINGS.tariffs.electroNight;

    if (SETTINGS.features.twoZone) {
        let totalKw = (r.electroDay || 0) + (r.electroNight || 0);
        if (isWinter && totalKw <= 2000) {
            electroCost = ((r.electroDay || 0) * 2.64) + ((r.electroNight || 0) * 1.32);
        } else {
            electroCost = ((r.electroDay || 0) * baseTariff) + ((r.electroNight || 0) * nightTariff);
        }
    } else {
        if (isWinter && (r.electro||0) <= 2000) electroCost = (r.electro||0) * 2.64;
        else electroCost = (r.electro||0) * baseTariff;
    }

    const waterCost = (r.water||0) * SETTINGS.tariffs.water;
    const gasCost = (r.gas||0) * SETTINGS.tariffs.gas;
    return electroCost + waterCost + gasCost + (r.heating||0) + (r.garbage||0) + (r.internet||0);
}

function calculateForecast(records) {
    let total = 0; let count = 0;
    records.slice(0, 3).forEach(r => {
        const cost = calculateCostForRecord(r);
        if (cost > 0) { total += cost; count++; }
    });
    document.getElementById('forecast-amount').textContent = count === 0 ? "0 ₴" : `~ ${Math.round(total / count)} ₴`;
}

function formatMonthUI(dateString) {
    if (!dateString) return "Невідомо";
    const parts = dateString.split('-');
    if (parts.length !== 2) return dateString; 
    return new Date(parts[0], parts[1]-1).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
}

async function loadHistory() {
    if (!currentUser) return;
    historyList.innerHTML = '<div class="text-center text-gray-400 py-10">Завантаження...</div>';
    try {
        const records = await getUserRecords();
        historyList.innerHTML = ''; 
        if (records.length === 0) {
            historyList.innerHTML = '<div class="text-center text-gray-400 py-10">Немає збережених записів</div>'; return;
        }

        records.forEach((d, index) => {
            const prev = records[index + 1];
            const total = calculateCostForRecord(d);
            
            let electroHtml = '';
            if (SETTINGS.features.twoZone) {
                const dayDiff = prev ? `${prev.electroDayReading||0} ➔ ` : '';
                const nightDiff = prev ? `${prev.electroNightReading||0} ➔ ` : '';
                electroHtml = `
                    <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg mb-1">
                        <span class="text-xs font-bold text-orange-500"><i class="fa-solid fa-sun"></i> Світло (День)</span>
                        <span class="text-xs text-gray-600">${dayDiff}<b class="text-gray-900">${d.electroDayReading||0}</b> = <b class="text-blue-600">${d.electroDay||0} кВт</b></span>
                    </div>
                    <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg mb-2">
                        <span class="text-xs font-bold text-indigo-500"><i class="fa-solid fa-moon"></i> Світло (Ніч)</span>
                        <span class="text-xs text-gray-600">${nightDiff}<b class="text-gray-900">${d.electroNightReading||0}</b> = <b class="text-blue-600">${d.electroNight||0} кВт</b></span>
                    </div>`;
            } else {
                const elDiff = prev ? `${prev.electroReading||0} ➔ ` : '';
                electroHtml = `
                    <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg mb-2">
                        <span class="text-xs font-bold text-yellow-500"><i class="fa-solid fa-bolt"></i> Світло</span>
                        <span class="text-xs text-gray-600">${elDiff}<b class="text-gray-900">${d.electroReading||0}</b> = <b class="text-blue-600">${d.electro||0} кВт</b></span>
                    </div>`;
            }

            const waterDiff = prev ? `${prev.waterReading||0} ➔ ` : '';
            const gasDiff = prev ? `${prev.gasReading||0} ➔ ` : '';

            const card = `
                <div class="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                    <div class="flex justify-between items-center border-b border-gray-50 pb-3 mb-3">
                        <div class="font-black text-gray-800 capitalize text-lg">${formatMonthUI(d.date)}</div>
                        <div class="font-black text-blue-600 text-xl">~${Math.round(total)} ₴</div>
                    </div>
                    ${electroHtml}
                    ${SETTINGS.features.showWater ? `<div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg mb-2"><span class="text-xs font-bold text-blue-400"><i class="fa-solid fa-droplet"></i> Вода</span><span class="text-xs text-gray-600">${waterDiff}<b class="text-gray-900">${d.waterReading||0}</b> = <b class="text-blue-600">${d.water||0} м³</b></span></div>` : ''}
                    ${SETTINGS.features.showGas ? `<div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg"><span class="text-xs font-bold text-orange-400"><i class="fa-solid fa-fire"></i> Газ</span><span class="text-xs text-gray-600">${gasDiff}<b class="text-gray-900">${d.gasReading||0}</b> = <b class="text-blue-600">${d.gas||0} м³</b></span></div>` : ''}
                </div>`;
            historyList.insertAdjacentHTML('beforeend', card);
        });
    } catch (e) { historyList.innerHTML = '<div class="text-center text-red-400 py-10">Помилка завантаження.</div>'; }
}

// --- СПОВІЩЕННЯ ТА НАГАДУВАННЯ ---
function checkReminders() {
    const today = new Date().getDate();
    const container = document.getElementById('reminders-container');
    container.innerHTML = '';
    
    let toRemind = [];
    const isTodayInRange = (rangeStr) => {
        if (!rangeStr) return false;
        const parts = rangeStr.split('-');
        if (parts.length === 2) return today >= parseInt(parts[0]) && today <= parseInt(parts[1]);
        return today === parseInt(rangeStr);
    };

    if (isTodayInRange(SETTINGS.reminders.electro)) toRemind.push({ name: "Світло", icon: "fa-bolt", color: "yellow" });
    if (SETTINGS.features.showWater && isTodayInRange(SETTINGS.reminders.water)) toRemind.push({ name: "Вода", icon: "fa-droplet", color: "blue" });
    if (SETTINGS.features.showGas && isTodayInRange(SETTINGS.reminders.gas)) toRemind.push({ name: "Газ", icon: "fa-fire", color: "orange" });

    if (toRemind.length > 0) {
        let msg = toRemind.map(r => r.name).join(", ");
        container.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl flex items-center gap-3 shadow-sm animate-pulse">
                <i class="fa-solid fa-triangle-exclamation text-red-500 text-2xl"></i>
                <div><div class="font-bold text-red-800 text-sm">Час передати показники!</div><div class="text-xs text-red-600">Сьогодні потрібно передати: <b>${msg}</b>.</div></div>
            </div>`;
        if (Notification.permission === "granted") {
            new Notification("Комуналка PRO", { body: `Сьогодні необхідно передати показники для: ${msg}.`, icon: "https://cdn-icons-png.flaticon.com/512/2933/2933116.png" });
        }
    }
}

const notifyBtn = document.getElementById('request-notify-btn');
function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
        notifyBtn.classList.remove('hidden');
        notifyBtn.onclick = () => {
            Notification.requestPermission().then(p => { if (p === "granted") notifyBtn.classList.add('hidden'); });
        };
    }
}

// PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => {}));
}
