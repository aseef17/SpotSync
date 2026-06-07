import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import type { Messaging } from 'firebase/messaging';
import type { Analytics } from 'firebase/analytics';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-east4');

let messagingInstance: Messaging | null | undefined;
let analyticsInstance: Analytics | null | undefined;

/** Ensures messaging is loaded before notification APIs run. */
export async function ensureFirebaseMessaging(): Promise<Messaging | null> {
  if (messagingInstance !== undefined) return messagingInstance;
  if (typeof window === 'undefined') {
    messagingInstance = null;
    return messagingInstance;
  }
  try {
    const { getMessaging } = await import('firebase/messaging');
    messagingInstance = getMessaging(app);
  } catch {
    messagingInstance = null;
  }
  return messagingInstance;
}

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance !== undefined) return analyticsInstance;
  if (typeof window === 'undefined') {
    analyticsInstance = null;
    return analyticsInstance;
  }
  try {
    const { getAnalytics } = await import('firebase/analytics');
    analyticsInstance = getAnalytics(app);
  } catch {
    analyticsInstance = null;
  }
  return analyticsInstance;
}

export default app;
