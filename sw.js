const CACHE_NAME = 'chorequest-v69'; 
const ASSETS = [
    './',
    './index.html',
    './css/styles.css?v=69',
    './js/app.js?v=69',
    './js/auth.js?v=69',
    './js/firebase-db.js?v=69',
    './js/config.js?v=69',
    './js/version-manager.js?v=69',
    './manifest.json',
    './icons/icon.svg'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(names.map((n) => {
            if (n !== CACHE_NAME) {
                console.log('Deleting old cache:', n);
                return caches.delete(n);
            }
        }))).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    if (url.pathname.endsWith('version.json')) {
        e.respondWith(fetch(e.request));
        return;
    }
    // Network First for HTML and Version to ensure update detection
    if (e.request.mode === 'navigate') {
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
        return;
    }
    // Stale While Revalidate for other assets
    if (url.origin === location.origin) {
        e.respondWith(
            caches.match(e.request).then((cached) => {
                const networkFetch = fetch(e.request).then((res) => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                    }
                    return res;
                }).catch(() => null);
                return cached || networkFetch;
            })
        );
    }
});

self.addEventListener('message', (e) => {
    if (e.data.action === 'skipWaiting') self.skipWaiting();
});