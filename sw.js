const CACHE_NAME = 'komunalka-pwa-v1';

// Список файлів, які потрібно зберегти для роботи офлайн
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json'
    // Якщо ви додасте свої картинки/іконки, їх теж треба вписати сюди, наприклад:
    // '/icons/icon-512.png'
];

// Етап 1: Встановлення (Install) - завантажуємо файли в кеш
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Кешування файлів...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Етап 2: Активація (Activate) - видаляємо старий кеш, якщо версія оновилася
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Очищення старого кешу...');
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Етап 3: Перехоплення запитів (Fetch)
self.addEventListener('fetch', (event) => {
    // Ми НЕ кешуємо запити до Firebase (авторизація, база даних), 
    // оскільки Firebase SDK має власну систему роботи офлайн.
    if (event.request.url.includes('firestore.googleapis.com') || 
        event.request.url.includes('identitytoolkit.googleapis.com')) {
        return; // Пропускаємо такі запити до мережі
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Якщо файл є в кеші (наприклад, index.html) - віддаємо його миттєво.
            // Якщо немає - завантажуємо з інтернету.
            return cachedResponse || fetch(event.request);
        }).catch(() => {
            // Тут можна додати резервну сторінку, якщо офлайн і файлу немає в кеші
            console.log('[Service Worker] Ресурс недоступний офлайн');
        })
    );
});
