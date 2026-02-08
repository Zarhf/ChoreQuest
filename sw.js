const CACHE_NAME = 'chorequest-v37'; 
const ASSETS = [
    './',
    './index.html',
    './css/styles.css?v=37',
    './js/app.js?v=37',
    './js/auth.js?v=37',
    './js/firebase-db.js?v=37',
    './js/config.js?v=37',
    './js/version-manager.js?v=37',
    './manifest.json',
    './icons/icon.svg'
];

self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force activation immediately
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(names.map((n) => {
            if (n !== CACHE_NAME) return caches.delete(n);
        }))).then(() => self.clients.claim()) // Take control immediately
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // 1. NEVER CACHE version.json
    if (url.pathname.endsWith('version.json')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // 2. HTML -> Network First (Safe)
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // 3. Assets -> Stale While Revalidate (Fast + Update)
    if (url.origin === location.origin) {
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                const fetchPromise = fetch(e.request).then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, networkResponse.clone());
                    });
                    return networkResponse;
                });
                return cachedResponse || fetchPromise;
            })
        );
    }
});