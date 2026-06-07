import { getToken, onMessage, type Messaging } from 'firebase/messaging';
import { logger } from '@/utils/logger';
import { ensureFirebaseMessaging, db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getCachedUser, patchCachedUser, queueOfflineMutation } from '@/lib/localDb';
import { changeTopics, emitChange } from '@/lib/localDb/changeBus';

export interface NotificationPayload {
  notification?: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
}

let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;
let tokenOperationChain: Promise<unknown> = Promise.resolve();
let cachedFcmToken: string | null = null;

function isIndexedDbClosingError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'InvalidStateError' || error.message.includes('database connection is closing'))
  );
}

function enqueueTokenOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = tokenOperationChain.then(operation, operation);
  tokenOperationChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export class NotificationService {
  static getCachedToken(): string | null {
    return cachedFcmToken;
  }

  static async requestPermission(
    userId: string,
    options?: { enableNotifications?: boolean }
  ): Promise<boolean> {
    const messaging = await ensureFirebaseMessaging();
    if (!messaging) {
      logger.warn('Firebase Messaging not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return false;
      }

      const token = await this.getFCMToken(messaging);
      if (!token) {
        return false;
      }

      return await this.saveTokenToUser(userId, token, options);
    } catch (error) {
      logger.error('Error requesting notification permission:', error);
      return false;
    }
  }

  private static resetServiceWorkerRegistration(): void {
    serviceWorkerRegistrationPromise = null;
  }

  private static async getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      return null;
    }

    if (!serviceWorkerRegistrationPromise) {
      serviceWorkerRegistrationPromise = navigator.serviceWorker
        .register('/firebase-messaging-sw.js')
        .then(async (registration) => {
          await navigator.serviceWorker.ready;
          return registration;
        })
        .catch((error) => {
          this.resetServiceWorkerRegistration();
          throw error;
        });
    }

    try {
      return await serviceWorkerRegistrationPromise;
    } catch (error) {
      logger.error('Service worker registration failed:', error);
      return null;
    }
  }

  static async getFCMToken(messaging: Messaging): Promise<string | null> {
    return enqueueTokenOperation(() => this.getFCMTokenInternal(messaging));
  }

  private static async getFCMTokenInternal(messaging: Messaging): Promise<string | null> {
    if (!import.meta.env.VITE_FIREBASE_VAPID_KEY) {
      logger.error('VITE_FIREBASE_VAPID_KEY is not configured');
      return null;
    }

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const registration = await this.getServiceWorkerRegistration();
        if (!registration) {
          return null;
        }

        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (token) {
          cachedFcmToken = token;
          logger.info('FCM Token successfully retrieved:', token);
          return token;
        }

        logger.warn('FCM Token retrieval returned null. Check VAPID key and messaging permissions.');
        return null;
      } catch (error) {
        if (isIndexedDbClosingError(error) && attempt < maxAttempts) {
          logger.warn(`[notifications] FCM IndexedDB busy, retrying (${attempt}/${maxAttempts - 1})...`);
          this.resetServiceWorkerRegistration();
          await new Promise((resolve) => window.setTimeout(resolve, 400 * attempt));
          continue;
        }

        logger.error('FCM Token Error: An error occurred while retrieving token:', error);
        return null;
      }
    }

    return null;
  }

  static async saveTokenToUser(
    userId: string,
    token: string,
    options?: { enableNotifications?: boolean }
  ): Promise<boolean> {
    try {
      const userRef = doc(db, 'users', userId);
      const updates: Record<string, unknown> = {
        fcmTokens: arrayUnion(token),
      };

      if (options?.enableNotifications) {
        updates.notificationsDisabled = false;
      }

      await updateDoc(userRef, updates);

      const cached = await getCachedUser(userId);
      const existingTokens = cached?.fcmTokens ?? [];
      const mergedTokens = existingTokens.includes(token)
        ? existingTokens
        : [...existingTokens, token];

      await patchCachedUser(userId, {
        fcmTokens: mergedTokens,
        ...(options?.enableNotifications ? { notificationsDisabled: false } : {}),
        updatedAt: new Date(),
      });
      emitChange(changeTopics.user(userId));

      cachedFcmToken = token;
      logger.info(
        `FCM Token successfully synced to users/${userId}${options?.enableNotifications ? ' (notifications enabled)' : ''}`
      );
      return true;
    } catch (error) {
      logger.error(`FCM Sync Error: Failed to save token to users/${userId}:`, error);
      return false;
    }
  }

  static async removeDeviceToken(userId: string, token: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmTokens: arrayRemove(token),
      });

      await patchCachedUser(userId, {
        fcmTokens: [],
        updatedAt: new Date(),
      });
      emitChange(changeTopics.user(userId));

      if (cachedFcmToken === token) {
        cachedFcmToken = null;
      }
      logger.info(`FCM Token removed from users/${userId}`);
    } catch (error) {
      logger.error(`FCM Removal Error: Failed to remove token from users/${userId}:`, error);
    }
  }

  static async setNotificationsDisabled(userId: string, disabled: boolean): Promise<void> {
    try {
      await queueOfflineMutation(
        'setNotificationsDisabled',
        userId,
        { userId, disabled },
        async () => {
          await patchCachedUser(userId, { notificationsDisabled: disabled, updatedAt: new Date() });
          emitChange(changeTopics.user(userId));
        }
      );
      logger.info(`Notifications global status set to ${disabled} for users/${userId}`);
    } catch (error) {
      logger.error(`Failed to set notifications status to ${disabled} for users/${userId}:`, error);
    }
  }

  static async onMessageListener(callback?: (payload: NotificationPayload) => void) {
    const messaging = await ensureFirebaseMessaging();
    if (!messaging) return;
    return onMessage(messaging, (payload) => {
      logger.debug('Foreground message received:', payload);

      const title = payload.notification?.title || payload.data?.title;
      const body = payload.notification?.body || payload.data?.body;

      if (callback && title && body) {
        callback({
          notification: { title, body },
          data: payload.data,
        });
      }
    });
  }
}
