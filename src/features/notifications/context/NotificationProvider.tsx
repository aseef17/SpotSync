import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { logger } from '@/utils/logger';
import { useAuth } from '@/features/auth/context/AuthContext';
import { NotificationService } from '@/features/notifications/api/notificationService';
import { subscribeToUserProfile } from '@/features/auth/api/userProfileStore';
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
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      // Check once on mount
      const checkPermission = () => {
        const isGranted = Notification.permission === 'granted';
        setPermissionGranted(isGranted);

        // Wait for Firestore preferences before auto-syncing to avoid re-adding tokens
        // for users who explicitly disabled notifications.
        if (!preferencesLoaded) return;

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
  }, [user, tokenSynced, notificationsDisabled, preferencesLoaded]);

  // Live listener for user's FCM tokens status
  useEffect(() => {
    if (!user?.id) {
      setPreferencesLoaded(false);
      setTokenSynced(false);
      setNotificationsDisabled(false);
      return;
    }

    setPreferencesLoaded(false);

    const unsubscribe = subscribeToUserProfile(user.id, (profile) => {
      if (profile) {
        setTokenSynced(profile.fcmTokens.length > 0);
        setNotificationsDisabled(profile.notificationsDisabled);
      } else {
        setTokenSynced(false);
        setNotificationsDisabled(false);
      }
      setPreferencesLoaded(true);
    });

    return () => unsubscribe();
  }, [user?.id]);

  const requestPermission = useCallback(async () => {
    if (!user) return false;
    const granted = await NotificationService.requestPermission(user.id);
    if (granted) {
      await NotificationService.setNotificationsDisabled(user.id, false);
    }
    setPermissionGranted(granted);
    return granted;
  }, [user]);

  const disableNotifications = useCallback(async () => {
    if (!user) return;

    // Set global flag first so UI updates immediately
    await NotificationService.setNotificationsDisabled(user.id, true);

    // Try to get current token to remove only this device from the active tokens list
    try {
      const { ensureFirebaseMessaging } = await import('@/lib/firebase');
      const fbMessaging = await ensureFirebaseMessaging();
      if (fbMessaging) {
        const token = await NotificationService.getFCMToken(fbMessaging);
        if (token) {
          await NotificationService.removeDeviceToken(user.id, token);
        }
      }
    } catch (err) {
      logger.warn('Failed to remove specific device token during disable', err);
    }
  }, [user]);

  const contextValue = useMemo(
    () => ({
      permissionGranted,
      tokenSynced: !!user?.id && tokenSynced,
      notificationsDisabled,
      requestPermission,
      disableNotifications,
    }),
    [
      permissionGranted,
      user?.id,
      tokenSynced,
      notificationsDisabled,
      requestPermission,
      disableNotifications,
    ]
  );

  // Listen for FCM Messages (Foreground)
  useEffect(() => {
    if (!permissionGranted || notificationsDisabled) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    NotificationService.onMessageListener((payload) => {
      const { title, body } = payload.notification || {};
      if (title && body) {
        addToast('info', body, title, 5000);
      }
    }).then((unsub) => {
      if (cancelled) {
        unsub?.();
        return;
      }
      unsubscribe = unsub;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [permissionGranted, notificationsDisabled, addToast]);

  return (
    <NotificationContext.Provider value={contextValue}>{children}</NotificationContext.Provider>
  );
};
