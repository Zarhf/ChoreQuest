const CACHE_NAME = 'chorequest-v17'; 
const ASSETS = [
    './',
    './index.html',
    './css/styles.css?v=17',
    './js/app.js?v=17',
    './js/auth.js?v=17',
    './js/drive.js?v=17',
    './js/config.js?v=17',
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
    
    // Stratégie différente selon le type de ressource
    
    // 1. Navigation (HTML) -> Network First (Toujours chercher la dernière version)
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, response.clone());
                        return response;
                    });
                })
                .catch(() => {
                    return caches.match(e.request);
                })
        );
        return;
    }

    // 2. Assets statiques (JS/CSS/Images) -> Cache First (Rapide)
    if (url.origin === location.origin) {
        e.respondWith(
            caches.match(e.request).then((response) => {
                return response || fetch(e.request);
            })
        );
    }
});

self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});