const CACHE_NAME = 'komunalka-pwa-dynamic';

// Етап 1: Встановлення (миттєве оновлення без очікування)
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Змушуємо новий Service Worker активуватися миттєво
});

// Етап 2: Активація (одразу беремо під контроль всі відкриті вкладки)
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Етап 3: Перехоплення запитів (Стратегія: Network First, Fallback to Cache)
self.addEventListener('fetch', (event) => {
    // Ігноруємо запити до бази даних Firebase, щоб не кешувати чутливі дані
    if (event.request.url.includes('firestore.googleapis.com') || 
        event.request.url.includes('identitytoolkit.googleapis.com')) {
        return;
    }

    event.respondWith(
        // КРОК 1: Завжди пробуємо завантажити свіжу версію з інтернету
        fetch(event.request)
            .then((networkResponse) => {
                // Якщо інтернет є і файл успішно завантажено:
                // Зберігаємо його свіжу копію в кеш для майбутнього офлайну
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse; // Віддаємо свіжий файл користувачу
            })
            .catch(() => {
                // КРОК 2: Якщо інтернету немає (fetch видав помилку) - дістаємо з кешу
                return caches.match(event.request);
            })
    );
});
