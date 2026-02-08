const CACHE_NAME = 'chorequest-v80'; 
const ASSETS = [
    './',
    './index.html',
    './css/styles.css?v=80',
    './js/app.js?v=80',
    './js/auth.js?v=80',
    './js/firebase-db.js?v=80',
    './js/config.js?v=80',
    './js/version-manager.js?v=80',
    './v.json?v=80',
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
    // bypass cache for version check
    if (url.pathname.endsWith('v.json') || url.pathname.endsWith('version.json') || url.pathname.endsWith('admin.html')) {
        e.respondWith(fetch(e.request));
        return;
    }
    if (e.request.mode === 'navigate') {
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
        return;
    }
    if (url.origin === location.origin) {
        e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
    }
});

self.addEventListener('message', (e) => {
    if (e.data.action === 'skipWaiting') self.skipWaiting();
});