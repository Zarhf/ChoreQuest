importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Ces valeurs doivent correspondre à js/config.js
firebase.initializeApp({
    apiKey: "AIzaSyA-utrSA-wu_Hjmxa4a8eox2vJ--b5ccr4",
    authDomain: "chorequest-1c5b6.firebaseapp.com",
    projectId: "chorequest-1c5b6",
    storageBucket: "chorequest-1c5b6.firebasestorage.app",
    messagingSenderId: "8039494089",
    appId: "1:8039494089:web:d98b458ebdc89145c2f818",
    measurementId: "G-RP3LQ9PLKF"
});

const messaging = firebase.messaging();

// Gérer les messages en arrière-plan
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
