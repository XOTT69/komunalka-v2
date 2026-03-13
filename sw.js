const STATIC_CACHE = "komunalka-static-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(key => key !== STATIC_CACHE ? caches.delete(key) : Promise.resolve())
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/") || url.hostname.includes("workers.dev")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({
          success: false,
          error: "OFFLINE_API_UNAVAILABLE"
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);

    const networkFetch = fetch(event.request)
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => cached);

    return cached || networkFetch;
  })());
});
