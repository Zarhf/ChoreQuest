const CACHE_NAME = 'chorequest-v94'; 
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './js/auth.js',
    './js/firebase-db.js',
    './js/config.js',
    './js/version-manager.js',
    './v.json',
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
            if (n !== CACHE_NAME) return caches.delete(n);
        }))).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    
    // STRATÉGIE : Network First pour les fichiers de version et l'index
    if (url.pathname.endsWith('v.json') || url.pathname.endsWith('version.json') || url.pathname.endsWith('index.html') || url.pathname === '/') {
        e.respondWith(
            fetch(e.request).then(res => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                return res;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // Cache First pour les autres assets
    if (url.origin === location.origin) {
        e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
    }
});

self.addEventListener('message', (e) => {
    if (e.data.action === 'skipWaiting') self.skipWaiting();
});