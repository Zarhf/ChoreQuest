const CACHE_NAME = 'chorequest-v31'; 
const ASSETS = [
    './',
    './index.html',
    './css/styles.css?v=31',
    './js/app.js?v=31',
    './js/auth.js?v=31',
    './js/firebase-db.js?v=31',
    './js/config.js?v=31',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((names) => Promise.all(names.map((n) => {
        if (n !== CACHE_NAME) return caches.delete(n);
    }))));
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
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