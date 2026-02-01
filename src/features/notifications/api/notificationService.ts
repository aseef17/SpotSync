import { getToken, onMessage, type Messaging } from 'firebase/messaging';
import { logger } from '@/utils/logger';
import { messaging, db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

export interface NotificationPayload {
  notification?: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
}

export class NotificationService {
  static async requestPermission(userId: string): Promise<boolean> {
    if (!messaging) {
      logger.warn('Firebase Messaging not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await this.getFCMToken(messaging);
        if (token) {
          await this.saveTokenToUser(userId, token);
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.error('Error requesting notification permission:', error);
      return false;
    }
  }

  static async getFCMToken(messaging: Messaging): Promise<string | null> {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (token) {
          logger.info('FCM Token successfully retrieved:', token);
          return token;
        } else {
          logger.warn(
            'FCM Token retrieval returned null. Check VAPID key and messaging permissions.'
          );
          return null;
        }
      } else {
        logger.error('Service Workers are not supported in this browser environment.');
        return null;
      }
    } catch (error) {
      logger.error('FCM Token Error: An error occurred while retrieving token:', error);
      return null;
    }
  }

  static async saveTokenToUser(userId: string, token: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmTokens: arrayUnion(token),
        notificationsDisabled: false,
      });
      logger.info(`FCM Token successfully synced to users/${userId}`);
    } catch (error) {
      logger.error(`FCM Sync Error: Failed to save token to users/${userId}:`, error);
    }
  }

  static async removeDeviceToken(userId: string, token: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmTokens: arrayRemove(token),
      });
      logger.info(`FCM Token removed from users/${userId}`);
    } catch (error) {
      logger.error(`FCM Removal Error: Failed to remove token from users/${userId}:`, error);
    }
  }

  static async removeTokenFromUser(userId: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        fcmTokens: [],
        notificationsDisabled: true,
      });
      logger.info(`FCM Tokens successfully removed from users/${userId}`);
    } catch (error) {
      logger.error(`FCM Removal Error: Failed to remove tokens from users/${userId}:`, error);
    }
  }

  static onMessageListener(callback?: (payload: NotificationPayload) => void) {
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
