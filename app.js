import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Конфігурація Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBgRHmaHjg23BIZjJdCucwnmMFDX57XP80",
  authDomain: "pwakomun.firebaseapp.com",
  projectId: "pwakomun",
  storageBucket: "pwakomun.firebasestorage.app",
  messagingSenderId: "4437974770",
  appId: "1:4437974770:web:b4fd86b8ba9ab062707a6b",
  measurementId: "G-25R14B1HSX"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
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

// Навігація
const navInput = document.getElementById('nav-input');
const navHistory = document.getElementById('nav-history');
const tabInput = document.getElementById('tab-input');
const tabHistory = document.getElementById('tab-history');
const historyList = document.getElementById('history-list');

// Глобальний стан
let currentUser = null;
let lastReadings = null; // Зберігаємо тут попередні показники лічильників
const TARIFFS = { electro: 2.64, water: 30.38, gas: 7.96 }; 

// --- 1. АВТОРИЗАЦІЯ ---
const provider = new GoogleAuthProvider();

loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider).catch(error => console.error("Помилка входу:", error));
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        userAvatarEl.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U';
        
        // Завантажуємо дані
        fetchLastReadings();
        calculateForecast();
    } else {
        currentUser = null;
        loginScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
    }
});

// --- 2. НАВІГАЦІЯ ---
navInput.addEventListener('click', () => {
    tabInput.classList.remove('hidden'); tabHistory.classList.add('hidden');
    navInput.classList.replace('text-gray-400', 'text-blue-600'); navHistory.classList.replace('text-blue-600', 'text-gray-400');
    fetchLastReadings(); // Оновлюємо попередні показники при переході на вкладку вводу
});

navHistory.addEventListener('click', () => {
    tabHistory.classList.remove('hidden'); tabInput.classList.add('hidden');
    navHistory.classList.replace('text-gray-400', 'text-blue-600'); navInput.classList.replace('text-blue-600', 'text-gray-400');
    loadHistory(); 
});

// --- 3. ОТРИМАННЯ ПОПЕРЕДНІХ ПОКАЗНИКІВ ---
async function fetchLastReadings() {
    if (!currentUser) return;

    const q = query(collection(db, "utilities"), where("userId", "==", currentUser.uid), orderBy("date", "desc"), limit(1));
    
    try {
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const lastDoc = snapshot.docs[0].data();
            // Зберігаємо останні абсолютні показники лічильника
            lastReadings = {
                electroReading: lastDoc.electroReading || 0,
                waterReading: lastDoc.waterReading || 0,
                gasReading: lastDoc.gasReading || 0
            };
            
            document.getElementById('last-electro').textContent = `Попередній: ${lastReadings.electroReading}`;
            document.getElementById('last-water').textContent = `Попередній: ${lastReadings.waterReading}`;
            document.getElementById('last-gas').textContent = `Попередній: ${lastReadings.gasReading}`;
        } else {
            lastReadings = null;
            document.getElementById('last-electro').textContent = "Попередній: немає (це буде базовий запис)";
            document.getElementById('last-water').textContent = "Попередній: немає (це буде базовий запис)";
            document.getElementById('last-gas').textContent = "Попередній: немає (це буде базовий запис)";
        }
    } catch (e) {
        console.error("Помилка завантаження попередніх показників:", e);
    }
}

// --- 4. ЗБЕРЕЖЕННЯ ДАНИХ (З РОЗРАХУНКОМ РІЗНИЦІ) ---
saveBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    
    const currentElectro = Number(document.getElementById('electro-reading').value) || 0;
    const currentWater = Number(document.getElementById('water-reading').value) || 0;
    const currentGas = Number(document.getElementById('gas-reading').value) || 0;

    // Перевірка, щоб нові показники не були меншими за старі
    if (lastReadings) {
        if (currentElectro > 0 && currentElectro < lastReadings.electroReading) {
            alert("Помилка: Новий показник світла менший за попередній!"); return;
        }
        if (currentWater > 0 && currentWater < lastReadings.waterReading) {
            alert("Помилка: Новий показник води менший за попередній!"); return;
        }
        if (currentGas > 0 && currentGas < lastReadings.gasReading) {
            alert("Помилка: Новий показник газу менший за попередній!"); return;
        }
    }

    // Рахуємо спожите (Різниця між новим і старим)
    // Якщо це перший запис (lastReadings == null), споживання = 0, ми просто фіксуємо базу.
    const consumedElectro = lastReadings ? (currentElectro > 0 ? currentElectro - lastReadings.electroReading : 0) : 0;
    const consumedWater = lastReadings ? (currentWater > 0 ? currentWater - lastReadings.waterReading : 0) : 0;
    const consumedGas = lastReadings ? (currentGas > 0 ? currentGas - lastReadings.gasReading : 0) : 0;

    const data = {
        userId: currentUser.uid,
        date: new Date().toISOString(),
        
        // Зберігаємо спожиту кількість (для історії і прогнозів)
        electro: consumedElectro,
        water: consumedWater,
        gas: consumedGas,

        // Зберігаємо абсолютні показники лічильників (для наступного місяця)
        electroReading: currentElectro > 0 ? currentElectro : (lastReadings ? lastReadings.electroReading : 0),
        waterReading: currentWater > 0 ? currentWater : (lastReadings ? lastReadings.waterReading : 0),
        gasReading: currentGas > 0 ? currentGas : (lastReadings ? lastReadings.gasReading : 0),
        
        heating: Number(document.getElementById('heating').value) || 0,
        garbage: Number(document.getElementById('garbage').value) || 0,
        internet: Number(document.getElementById('internet').value) || 0,
    };

    try {
        saveBtn.textContent = "Зберігаємо...";
        saveBtn.disabled = true;

        await addDoc(collection(db, "utilities"), data);
        
        saveBtn.textContent = "Збережено!";
        saveBtn.classList.replace('bg-green-500', 'bg-blue-500');
        
        document.querySelectorAll('#tab-input input').forEach(input => input.value = '');
        
        setTimeout(() => {
            saveBtn.textContent = "Зберегти показники";
            saveBtn.classList.replace('bg-blue-500', 'bg-green-500');
            saveBtn.disabled = false;
        }, 2000);

        // Оновлюємо дані на екрані
        fetchLastReadings();
        calculateForecast();

    } catch (e) {
        console.error("Помилка збереження: ", e);
        alert("Помилка збереження даних. Перевірте консоль.");
        saveBtn.textContent = "Зберегти показники";
        saveBtn.disabled = false;
    }
});

// --- 5. ПРОГНОЗ ТА ІСТОРІЯ ---
async function calculateForecast() {
    if (!currentUser) return;

    const q = query(collection(db, "utilities"), where("userId", "==", currentUser.uid), orderBy("date", "desc"), limit(3));
    
    try {
        const querySnapshot = await getDocs(q);
        let totalCost = 0; let count = 0;

        querySnapshot.forEach((doc) => {
            const d = doc.data();
            // Якщо це був найперший (базовий) запис, його сума буде складатись лише з фіксованих платежів, бо споживання = 0
            if (d.electro > 0 || d.water > 0 || d.gas > 0 || d.heating > 0 || d.garbage > 0 || d.internet > 0) {
                const monthCost = (d.electro * TARIFFS.electro) + (d.water * TARIFFS.water) + (d.gas * TARIFFS.gas) + d.heating + d.garbage + d.internet;
                totalCost += monthCost;
                count++;
            }
        });

        if (count === 0) {
            forecastEl.textContent = "Немає даних";
        } else {
            const average = Math.round(totalCost / count);
            forecastEl.textContent = `~ ${average} ₴`;
        }
    } catch (e) { forecastEl.textContent = "Помилка"; }
}

async function loadHistory() {
    if (!currentUser) return;
    historyList.innerHTML = '<div class="text-center text-gray-400 py-10"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><br>Завантаження...</div>';

    const q = query(collection(db, "utilities"), where("userId", "==", currentUser.uid), orderBy("date", "desc"));
    
    try {
        const querySnapshot = await getDocs(q);
        historyList.innerHTML = ''; 
        
        if (querySnapshot.empty) {
            historyList.innerHTML = '<div class="text-center text-gray-400 py-10 bg-white rounded-2xl shadow-sm border border-gray-100">Немає збережених записів</div>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const d = doc.data();
            const dateObj = new Date(d.date);
            const dateStr = dateObj.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric', day: 'numeric' });
            
            const total = (d.electro * TARIFFS.electro) + (d.water * TARIFFS.water) + (d.gas * TARIFFS.gas) + d.heating + d.garbage + d.internet;

            const card = `
                <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center mb-3">
                    <div class="flex-1">
                        <div class="text-xs text-gray-400 mb-1 flex justify-between">
                            <span>${dateStr}</span>
                        </div>
                        <div class="flex gap-4 text-sm text-gray-600 mt-2">
                            <span title="Спожито (Показник лічильника)"><i class="fa-solid fa-bolt text-yellow-500"></i> ${d.electro} кВт</span>
                            <span title="Спожито (Показник лічильника)"><i class="fa-solid fa-droplet text-blue-400"></i> ${d.water} м³</span>
                            <span title="Спожито (Показник лічильника)"><i class="fa-solid fa-fire text-orange-500"></i> ${d.gas} м³</span>
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
    } catch (e) { historyList.innerHTML = '<div class="text-center text-red-400 py-10">Помилка завантаження</div>'; }
}

// --- 6. SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(error => console.error('Помилка Service Worker:', error));
    });
}
