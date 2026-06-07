import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { logger } from '@/utils/logger';
import { useAuth } from '@/features/auth/context/AuthContext';
import { NotificationService } from '@/features/notifications/api/notificationService';
import {
  subscribeToUserProfile,
  subscribeToUserProfileCacheOnly,
  type UserProfileSnapshot,
} from '@/features/auth/api/userProfileStore';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { useToastContext } from '@/hooks/useToastContext';
import { NotificationContext } from './NotificationContext';

export const NotificationProvider: React.FunctionComponent<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, requiresEmailVerification } = useAuth();
  const location = useLocation();
  const canSyncNotifications = !!user && !requiresEmailVerification;
  const isDashboard = location.pathname === '/dashboard';
  const isSettings = location.pathname === '/settings';
  // Live profile sync only on dashboard (ListsProvider also uses profile sync there; registry dedupes).
  const shouldSyncProfile = canSyncNotifications && isDashboard;
  const shouldReadProfileCache = canSyncNotifications && isSettings;
  const shouldAttemptFcmSync =
    canSyncNotifications &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted';
  const { addToast } = useToastContext();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [tokenSynced, setTokenSynced] = useState(false);
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    if ('Notification' in window) {
      setPermissionGranted(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    if (
      !('Notification' in window) ||
      !preferencesLoaded ||
      !canSyncNotifications ||
      !user?.id ||
      notificationsDisabled ||
      tokenSynced ||
      syncInFlightRef.current ||
      !shouldAttemptFcmSync
    ) {
      return;
    }

    if (Notification.permission !== 'granted') {
      return;
    }

    const lastCheck = sessionStorage.getItem(`fcm_sync_${user.id}`);
    const isRecentlyChecked = lastCheck && Date.now() - parseInt(lastCheck, 10) < 600000;
    if (isRecentlyChecked) {
      return;
    }

    syncInFlightRef.current = true;
    void NotificationService.requestPermission(user.id)
      .then((granted) => {
        sessionStorage.setItem(`fcm_sync_${user.id}`, Date.now().toString());
        if (granted) {
          setTokenSynced(true);
        }
      })
      .catch((err) => logger.error('Failed to sync notification token on mount:', err))
      .finally(() => {
        syncInFlightRef.current = false;
      });
  }, [
    canSyncNotifications,
    notificationsDisabled,
    preferencesLoaded,
    shouldAttemptFcmSync,
    tokenSynced,
    user?.id,
  ]);

  useEffect(() => {
    if ((!shouldSyncProfile && !shouldReadProfileCache) || !user?.id) {
      setPreferencesLoaded(false);
      setTokenSynced(false);
      setNotificationsDisabled(false);
      return;
    }

    let cancelled = false;

    const applyProfile = (profile: UserProfileSnapshot | null) => {
      if (cancelled) return;

      if (profile) {
        if (profile.fcmTokens.length > 0) {
          setTokenSynced(true);
        } else if (profile.notificationsDisabled) {
          setTokenSynced(false);
        }
        setNotificationsDisabled(profile.notificationsDisabled);
      } else {
        setTokenSynced(false);
        setNotificationsDisabled(false);
      }

      setPreferencesLoaded(true);
    };

    const unsubscribe = shouldSyncProfile
      ? subscribeToUserProfile(user.id, applyProfile)
      : subscribeToUserProfileCacheOnly(user.id, applyProfile);

    const timeoutId = window.setTimeout(
      () => {
        if (!cancelled) {
          setPreferencesLoaded(true);
        }
      },
      isBrowserOnline() ? 12000 : 3000
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [shouldSyncProfile, shouldReadProfileCache, user?.id]);

  const requestPermission = useCallback(async () => {
    if (!user || requiresEmailVerification) return false;

    while (syncInFlightRef.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    syncInFlightRef.current = true;
    setNotificationsDisabled(false);

    try {
      const granted = await NotificationService.requestPermission(user.id, {
        enableNotifications: true,
      });
      setPermissionGranted(granted || Notification.permission === 'granted');
      if (granted) {
        setTokenSynced(true);
        sessionStorage.setItem(`fcm_sync_${user.id}`, Date.now().toString());
      }
      return granted;
    } finally {
      syncInFlightRef.current = false;
    }
  }, [user, requiresEmailVerification]);

  const disableNotifications = useCallback(async () => {
    if (!user || requiresEmailVerification) return;

    setNotificationsDisabled(true);
    setTokenSynced(false);
    sessionStorage.removeItem(`fcm_sync_${user.id}`);

    await NotificationService.setNotificationsDisabled(user.id, true);

    const cachedToken = NotificationService.getCachedToken();
    if (cachedToken) {
      await NotificationService.removeDeviceToken(user.id, cachedToken);
    }
  }, [user, requiresEmailVerification]);

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
