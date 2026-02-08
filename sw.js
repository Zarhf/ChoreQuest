const CACHE_NAME = 'chorequest-v20'; 
const ASSETS = [
    './',
    './index.html',
    './css/styles.css?v=20',
    './js/app.js?v=20',
    './js/auth.js?v=20',
    './js/drive.js?v=20',
    './js/config.js?v=20',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            clients.claim(),
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).then((response) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, response.clone());
                    return response;
                });
            }).catch(() => caches.match(e.request))
        );
        return;
    }
    if (url.origin === location.origin) {
        e.respondWith(caches.match(e.request).then((response) => response || fetch(e.request)));
    }
});

self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});