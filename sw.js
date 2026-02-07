const CACHE_NAME = 'chorequest-v6'; 
const ASSETS = [
    './',
    './index.html',
    './css/styles.css?v=6',
    './js/app.js?v=6',
    './js/auth.js?v=6',
    './js/drive.js?v=6',
    './js/config.js?v=6',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    // On ne fait plus skipWaiting() ici pour permettre la notification
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
    if (url.origin !== location.origin) return;

    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});

// Écouter le message pour skipWaiting
self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});