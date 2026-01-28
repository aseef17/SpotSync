import React, { useEffect, useState } from 'react';
import { logger } from '@/utils/logger';
import { useAuth } from '@/features/auth/context/AuthContext';
import { NotificationService } from '@/features/notifications/api/notificationService';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { useToastContext } from '@/hooks/useToastContext';
import { NotificationContext } from './NotificationContext';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { addToast } = useToastContext();
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [tokenSynced, setTokenSynced] = useState(false);

    useEffect(() => {
        if ('Notification' in window) {
            // Check once on mount
            const checkPermission = () => {
                const isGranted = Notification.permission === 'granted';
                setPermissionGranted(isGranted);

                if (isGranted && user) {
                    // Check if we need to sync (if not synced or if last check was a while ago)
                    const lastCheck = sessionStorage.getItem(`fcm_sync_${user.id}`);
                    const isRecentlyChecked = lastCheck && (Date.now() - parseInt(lastCheck) < 600000); // 10 mins

                    if (!tokenSynced || !isRecentlyChecked) {
                        NotificationService.requestPermission(user.id)
                            .then(() => sessionStorage.setItem(`fcm_sync_${user.id}`, Date.now().toString()))
                            .catch(err =>
                                logger.error('Failed to sync notification token on mount:', err)
                            );
                    }
                }
            };

            checkPermission();
        }
    }, [user]);

    // Live listener for user's FCM tokens status
    useEffect(() => {
        if (!user?.id) {
            setTokenSynced(false);
            return;
        }

        const unsubscribe = onSnapshot(doc(db, 'users', user.id), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const tokens = data.fcmTokens || [];
                setTokenSynced(tokens.length > 0);
            }
        });

        return () => unsubscribe();
    }, [user?.id]);

    const requestPermission = async () => {
        if (!user) return false;
        const granted = await NotificationService.requestPermission(user.id);
        setPermissionGranted(granted);
        return granted;
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

    // Real-time Invitation Listener
    useEffect(() => {
        if (!user?.email) return;

        const q = query(
            collection(db, 'invitations'),
            where('invitedEmail', '==', user.email),
            where('status', '==', 'pending')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const title = 'New Invitation';
                    const body = `${data.invitedByUsername || 'Someone'} invited you to join "${data.listName || 'a list'}"`;

                    if (Notification.permission === 'granted') {
                        new Notification(title, { body, icon: '/icon-192x192.png' });
                    } else {
                        logger.debug('New Invitation:', body);
                    }
                }
            });
        });

        return () => unsubscribe();
    }, [user?.email]);

    return (
        <NotificationContext.Provider value={{ permissionGranted, tokenSynced, requestPermission }}>
            {children}
        </NotificationContext.Provider>
    );
};
