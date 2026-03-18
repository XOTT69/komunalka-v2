import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// DOM ЕЛЕМЕНТИ
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userAvatarEl = document.getElementById('user-avatar');
const saveBtn = document.getElementById('save-btn');
const forecastEl = document.getElementById('forecast-amount');
const monthInput = document.getElementById('record-month');

// Навігація
const navInput = document.getElementById('nav-input');
const navHistory = document.getElementById('nav-history');
const tabInput = document.getElementById('tab-input');
const tabHistory = document.getElementById('tab-history');
const historyList = document.getElementById('history-list');

// Глобальний стан
let currentUser = null;
let pastReadings = null; 
const TARIFFS = { electro: 2.64, water: 30.38, gas: 7.96 }; 

// --- ІНІЦІАЛІЗАЦІЯ ---
function initDate() {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    monthInput.value = currentMonthStr;
}
initDate();

monthInput.addEventListener('change', updateLastReadingsUI);

// --- АВТОРИЗАЦІЯ ---
loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch(err => alert("Помилка входу"));
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        userAvatarEl.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';
        updateLastReadingsUI();
        calculateForecast();
    } else {
        currentUser = null;
        loginScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
    }
});

// --- НАВІГАЦІЯ ---
navInput.addEventListener('click', () => {
    tabInput.classList.remove('hidden'); tabHistory.classList.add('hidden');
    navInput.classList.replace('text-gray-400', 'text-blue-600'); 
    navHistory.classList.replace('text-blue-600', 'text-gray-400');
    updateLastReadingsUI();
});

navHistory.addEventListener('click', () => {
    tabHistory.classList.remove('hidden'); tabInput.classList.add('hidden');
    navHistory.classList.replace('text-gray-400', 'text-blue-600'); 
    navInput.classList.replace('text-blue-600', 'text-gray-400');
    loadHistory(); 
});

// --- БАЗА ДАНИХ (БЕЗПЕЧНЕ ЧИТАННЯ) ---
async function getUserRecords() {
    try {
        const q = query(collection(db, "utilities"), where("userId", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        let records = [];
        snapshot.forEach(d => {
            const data = d.data();
            // ЗАХИСТ: Відкидаємо старі записи, де споживання аномально велике (більше 5000) - це старі глюки
            if (data.electro < 5000 && data.water < 1000 && data.gas < 1000) {
                records.push(data);
            }
        });
        records.sort((a, b) => b.date.localeCompare(a.date));
        return records;
    } catch (e) {
        console.error("Помилка завантаження з бази: ", e);
        return [];
    }
}

// --- ОТРИМАННЯ ПОПЕРЕДНІХ ПОКАЗНИКІВ ---
async function updateLastReadingsUI() {
    if (!currentUser) return;
    
    const selectedDate = monthInput.value; 
    const records = await getUserRecords();
    
    const past = records.find(r => r.date < selectedDate);
    
    if (past) {
        pastReadings = past;
        document.getElementById('last-electro').textContent = `Попередній (${formatMonthUI(past.date)}): ${past.electroReading}`;
        document.getElementById('last-water').textContent = `Попередній (${formatMonthUI(past.date)}): ${past.waterReading}`;
        document.getElementById('last-gas').textContent = `Попередній (${formatMonthUI(past.date)}): ${past.gasReading}`;
    } else {
        pastReadings = null;
        document.getElementById('last-electro').textContent = "Попередній: немає (це буде перший місяць)";
        document.getElementById('last-water').textContent = "Попередній: немає (це буде перший місяць)";
        document.getElementById('last-gas').textContent = "Попередній: немає (це буде перший місяць)";
    }
}

// --- ЗБЕРЕЖЕННЯ ---
saveBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    
    const selectedDate = monthInput.value;
    if (!selectedDate) { alert("Будь ласка, виберіть місяць!"); return; }

    const currentElectro = Number(document.getElementById('electro-reading').value) || 0;
    const currentWater = Number(document.getElementById('water-reading').value) || 0;
    const currentGas = Number(document.getElementById('gas-reading').value) || 0;

    if (pastReadings) {
        if (currentElectro > 0 && currentElectro < pastReadings.electroReading) { alert("Нове світло менше за попереднє!"); return; }
        if (currentWater > 0 && currentWater < pastReadings.waterReading) { alert("Нова вода менша за попередню!"); return; }
        if (currentGas > 0 && currentGas < pastReadings.gasReading) { alert("Новий газ менший за попередній!"); return; }
    }

    const consumedElectro = pastReadings ? (currentElectro > 0 ? currentElectro - pastReadings.electroReading : 0) : 0;
    const consumedWater = pastReadings ? (currentWater > 0 ? currentWater - pastReadings.waterReading : 0) : 0;
    const consumedGas = pastReadings ? (currentGas > 0 ? currentGas - pastReadings.gasReading : 0) : 0;

    const data = {
        userId: currentUser.uid,
        date: selectedDate,
        electro: consumedElectro,
        water: consumedWater,
        gas: consumedGas,
        electroReading: currentElectro > 0 ? currentElectro : (pastReadings ? pastReadings.electroReading : 0),
        waterReading: currentWater > 0 ? currentWater : (pastReadings ? pastReadings.waterReading : 0),
        gasReading: currentGas > 0 ? currentGas : (pastReadings ? pastReadings.gasReading : 0),
        heating: Number(document.getElementById('heating').value) || 0,
        garbage: Number(document.getElementById('garbage').value) || 0,
        internet: Number(document.getElementById('internet').value) || 0,
    };

    try {
        saveBtn.textContent = "Зберігаємо...";
        saveBtn.disabled = true;

        const docId = `${currentUser.uid}_${selectedDate}`;
        const docRef = doc(db, "utilities", docId);
        await setDoc(docRef, data, { merge: true });
        
        saveBtn.textContent = "Збережено!";
        saveBtn.classList.replace('bg-green-500', 'bg-blue-500');
        
        document.querySelectorAll('#tab-input input[type="number"]').forEach(i => i.value = '');
        
        setTimeout(() => {
            saveBtn.textContent = "Зберегти показники";
            saveBtn.classList.replace('bg-blue-500', 'bg-green-500');
            saveBtn.disabled = false;
        }, 2000);

        updateLastReadingsUI();
        calculateForecast();

    } catch (e) {
        console.error("Помилка збереження: ", e);
        alert("Помилка бази. Перевірте Firestore Rules (Крок 1)!");
        saveBtn.textContent = "Зберегти показники";
        saveBtn.disabled = false;
    }
});

// --- ФОРМАТУВАННЯ ТА ІСТОРІЯ ---
function formatMonthUI(yyyyMm) {
    if (!yyyyMm) return "Невідомо";
    const [year, month] = yyyMm.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
}

async function calculateForecast() {
    if (!currentUser) return;
    try {
        const records = await getUserRecords();
        let totalCost = 0; let count = 0;

        const lastThree = records.slice(0, 3);
        
        lastThree.forEach((d) => {
            if (d.electro > 0 || d.water > 0 || d.gas > 0 || d.heating > 0 || d.garbage > 0 || d.internet > 0) {
                totalCost += (d.electro * TARIFFS.electro) + (d.water * TARIFFS.water) + (d.gas * TARIFFS.gas) + d.heating + d.garbage + d.internet;
                count++;
            }
        });

        forecastEl.textContent = count === 0 ? "Немає даних" : `~ ${Math.round(totalCost / count)} ₴`;
    } catch (e) { forecastEl.textContent = "Помилка"; }
}

async function loadHistory() {
    if (!currentUser) return;
    historyList.innerHTML = '<div class="text-center text-gray-400 py-10"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><br>Завантаження...</div>';
    
    try {
        const records = await getUserRecords();
        historyList.innerHTML = ''; 
        
        if (records.length === 0) {
            historyList.innerHTML = '<div class="text-center text-gray-400 py-10 bg-white rounded-2xl shadow-sm border border-gray-100">Немає збережених записів</div>';
            return;
        }

        records.forEach((d) => {
            const total = (d.electro * TARIFFS.electro) + (d.water * TARIFFS.water) + (d.gas * TARIFFS.gas) + d.heating + d.garbage + d.internet;
            const monthName = formatMonthUI(d.date);

            const card = `
                <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center mb-3">
                    <div class="flex-1">
                        <div class="font-bold text-gray-700 mb-1 capitalize">${monthName}</div>
                        <div class="flex gap-4 text-xs text-gray-500 mt-2">
                            <span title="Показник лічильника: ${d.electroReading}"><i class="fa-solid fa-bolt text-yellow-500"></i> ${d.electro} кВт</span>
                            <span title="Показник лічильника: ${d.waterReading}"><i class="fa-solid fa-droplet text-blue-400"></i> ${d.water} м³</span>
                            <span title="Показник лічильника: ${d.gasReading}"><i class="fa-solid fa-fire text-orange-500"></i> ${d.gas} м³</span>
                        </div>
                    </div>
                    <div class="text-right ml-4 border-l pl-4 border-gray-100">
                        <div class="text-[10px] text-gray-400 uppercase tracking-wide">До сплати</div>
                        <div class="font-black text-blue-600 text-lg">~${Math.round(total)} ₴</div>
                    </div>
                </div>
            `;
            historyList.insertAdjacentHTML('beforeend', card);
        });
    } catch (e) { 
        historyList.innerHTML = '<div class="text-center text-red-400 py-10">Помилка завантаження. Перевірте консоль (F12).</div>'; 
        console.error(e);
    }
}

// Service Worker (PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => {}));
}
