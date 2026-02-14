console.log("[SW] Chargement du Service Worker...");

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Config injectée dynamiquement par le déploiement
firebase.initializeApp({
    apiKey: "{{FIREBASE_API_KEY}}",
    authDomain: "{{FIREBASE_AUTH_DOMAIN}}",
    projectId: "{{FIREBASE_PROJECT_ID}}",
    storageBucket: "{{FIREBASE_STORAGE_BUCKET}}",
    messagingSenderId: "{{FIREBASE_MESSAGING_SENDER_ID}}",
    appId: "{{FIREBASE_APP_ID}}",
    measurementId: "{{FIREBASE_MEASUREMENT_ID}}"
});

const messaging = firebase.messaging();

// Gérer les messages en arrière-plan
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Message en arrière-plan reçu :', payload);
  
  const notificationTitle = payload.notification?.title || payload.data?.title || "ChoreQuest";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "",
    icon: 'icons/icon.svg',
    badge: 'icons/icon.svg',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Événement d'installation
self.addEventListener('install', (event) => {
    console.log('[SW] Installé');
    self.skipWaiting();
});

// Événement d'activation
self.addEventListener('activate', (event) => {
    console.log('[SW] Activé et prêt à contrôler la page');
});
