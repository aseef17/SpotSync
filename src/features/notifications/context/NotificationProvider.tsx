import React, { useEffect, useState } from 'react';
import { logger } from '@/utils/logger';
import { useAuth } from '@/features/auth/context/AuthContext';
import { NotificationService } from '@/features/notifications/api/notificationService';
import { db } from '@/lib/firebase';
import { onSnapshot, doc } from 'firebase/firestore';
import { useToastContext } from '@/hooks/useToastContext';
import { NotificationContext } from './NotificationContext';

export const NotificationProvider: React.FunctionComponent<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const { addToast } = useToastContext();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [tokenSynced, setTokenSynced] = useState(false);
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      // Check once on mount
      const checkPermission = () => {
        const isGranted = Notification.permission === 'granted';
        setPermissionGranted(isGranted);

        // DO NOT auto-sync if notifications are explicitly disabled by the user
        if (isGranted && user && !notificationsDisabled) {
          // Check if we need to sync (if not synced or if last check was a while ago)
          const lastCheck = sessionStorage.getItem(`fcm_sync_${user.id}`);
          const isRecentlyChecked = lastCheck && Date.now() - parseInt(lastCheck) < 600000; // 10 mins

          if (!tokenSynced || !isRecentlyChecked) {
            NotificationService.requestPermission(user.id)
              .then(() => sessionStorage.setItem(`fcm_sync_${user.id}`, Date.now().toString()))
              .catch((err) => logger.error('Failed to sync notification token on mount:', err));
          }
        }
      };

      checkPermission();
    }
  }, [user, tokenSynced, notificationsDisabled]);

  // Live listener for user's FCM tokens status
  // Live listener for user's FCM tokens status
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const tokens = data.fcmTokens || [];
        setTokenSynced(tokens.length > 0);
        setNotificationsDisabled(data.notificationsDisabled === true);
      }
    });

    return () => unsubscribe();
  }, [user?.id]);

  const requestPermission = async () => {
    if (!user) return false;
    const granted = await NotificationService.requestPermission(user.id);
    if (granted) {
      await NotificationService.setNotificationsDisabled(user.id, false);
    }
    setPermissionGranted(granted);
    return granted;
  };

  const disableNotifications = async () => {
    if (!user) return;

    // Set global flag first so UI updates immediately
    await NotificationService.setNotificationsDisabled(user.id, true);

    // Try to get current token to remove only this device from the active tokens list
    try {
      const { messaging: fbMessaging } = await import('@/lib/firebase');
      if (fbMessaging) {
        const token = await NotificationService.getFCMToken(fbMessaging);
        if (token) {
          await NotificationService.removeDeviceToken(user.id, token);
        }
      }
    } catch (err) {
      logger.warn('Failed to remove specific device token during disable', err);
    }
  };

  // Listen for FCM Messages (Foreground)
  useEffect(() => {
    if (permissionGranted) {
      const unsubscribe = NotificationService.onMessageListener((payload) => {
        const { title, body } = payload.notification || {};
        if (title && body) {
          addToast('info', body, title, 5000);
        }
      });
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [permissionGranted, addToast]);

  return (
    <NotificationContext.Provider
      value={{
        permissionGranted,
        tokenSynced: !!user?.id && tokenSynced,
        notificationsDisabled,
        requestPermission,
        disableNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
