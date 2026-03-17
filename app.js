// Підключаємо необхідні модулі Firebase через CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Ваша конфігурація Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBgRHmaHjg23BIZjJdCucwnmMFDX57XP80",
  authDomain: "pwakomun.firebaseapp.com",
  projectId: "pwakomun",
  storageBucket: "pwakomun.firebasestorage.app",
  messagingSenderId: "4437974770",
  appId: "1:4437974770:web:b4fd86b8ba9ab062707a6b",
  measurementId: "G-25R14B1HSX"
};

// Ініціалізація Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Елементи інтерфейсу
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userNameEl = document.getElementById('user-name');
const saveBtn = document.getElementById('save-btn');
const forecastEl = document.getElementById('forecast-amount');

// Глобальна змінна для збереження поточного користувача
let currentUser = null;

// Тарифи для орієнтовного розрахунку прогнозу (можете змінити на актуальні для вас)
const TARIFFS = { electro: 2.64, water: 30.38, gas: 7.96 }; 

// --- 1. АВТОРИЗАЦІЯ ---
const provider = new GoogleAuthProvider();

loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider).catch(error => {
        console.error("Помилка входу:", error);
        alert("Не вдалося увійти. Перевірте консоль для деталей.");
    });
});

logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// Відслідковуємо, чи користувач увійшов/вийшов
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        userNameEl.textContent = user.displayName;
        
        // Одразу завантажуємо прогноз при вході
        calculateForecast();
    } else {
        currentUser = null;
        loginScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
    }
});

// --- 2. ЗБЕРЕЖЕННЯ ДАНИХ ---
saveBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    
    // Збираємо дані з усіх інпутів форми
    const data = {
        userId: currentUser.uid,
        date: new Date().toISOString(),
        electro: Number(document.getElementById('electro').value) || 0,
        water: Number(document.getElementById('water').value) || 0,
        gas: Number(document.getElementById('gas').value) || 0,
        heating: Number(document.getElementById('heating').value) || 0,
        garbage: Number(document.getElementById('garbage').value) || 0,
        internet: Number(document.getElementById('internet').value) || 0,
    };

    try {
        saveBtn.textContent = "Зберігаємо...";
        saveBtn.disabled = true;

        // Записуємо документ в колекцію "utilities" у Firestore
        await addDoc(collection(db, "utilities"), data);
        
        saveBtn.textContent = "Збережено!";
        saveBtn.classList.replace('bg-green-500', 'bg-blue-500');
        
        // Очищаємо всі поля після успішного збереження
        document.querySelectorAll('input').forEach(input => input.value = '');
        
        // Повертаємо кнопку в початковий стан через 2 секунди
        setTimeout(() => {
            saveBtn.textContent = "Зберегти в базу";
            saveBtn.classList.replace('bg-blue-500', 'bg-green-500');
            saveBtn.disabled = false;
        }, 2000);

        // Оновлюємо прогноз, щоб врахувати нові дані
        calculateForecast();

    } catch (e) {
        console.error("Помилка збереження: ", e);
        alert("Помилка збереження даних. Перевірте правила доступу Firestore.");
        saveBtn.textContent = "Зберегти в базу";
        saveBtn.disabled = false;
    }
});

// --- 3. РОЗРАХУНОК ПРОГНОЗУ НА НАСТУПНИЙ МІСЯЦЬ ---
async function calculateForecast() {
    if (!currentUser) return;

    // Шукаємо до 3 останніх записів саме цього користувача
    const q = query(
        collection(db, "utilities"), 
        where("userId", "==", currentUser.uid), 
        orderBy("date", "desc"), 
        limit(3)
    );
    
    try {
        const querySnapshot = await getDocs(q);
        let totalCost = 0;
        let count = 0;

        querySnapshot.forEach((doc) => {
            const d = doc.data();
            // Рахуємо орієнтовну суму за місяць: споживання * тариф + фіксовані платежі
            const monthCost = (d.electro * TARIFFS.electro) + 
                              (d.water * TARIFFS.water) + 
                              (d.gas * TARIFFS.gas) + 
                              d.heating + d.garbage + d.internet;
            totalCost += monthCost;
            count++;
        });

        if (count === 0) {
            forecastEl.textContent = "Немає даних";
        } else {
            // Рахуємо середнє значення за знайдені місяці
            const average = Math.round(totalCost / count);
            forecastEl.textContent = `~ ${average} грн`;
        }
    } catch (e) {
        console.error("Помилка завантаження даних для прогнозу: ", e);
        // Щоб помилка індексу не ламала інтерфейс:
        forecastEl.textContent = "Помилка завантаження"; 
    }
}
