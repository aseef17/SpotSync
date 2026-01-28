importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the
// messagingSenderId.
firebase.initializeApp({
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Extract title/body from notification OR data (supporting data-only messages)
  const title = payload.notification?.title || payload.data?.title || 'Notification';
  const body = payload.notification?.body || payload.data?.body || 'You have a new update';
  
  const notificationOptions = {
    body: body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: payload.data // Pass through the data for click handling
  };

  return self.registration.showNotification(title, notificationOptions);
});
