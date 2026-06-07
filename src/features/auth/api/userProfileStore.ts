import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';

export interface UserProfileSnapshot {
  savedLists: string[];
  fcmTokens: string[];
  notificationsDisabled: boolean;
}

type UserProfileListener = (profile: UserProfileSnapshot | null) => void;

let activeUserId: string | null = null;
let unsubscribeFirestore: (() => void) | null = null;
const listeners = new Set<UserProfileListener>();

function emit(data: UserProfileSnapshot | null) {
  listeners.forEach((listener) => listener(data));
}

function startSubscription(userId: string) {
  unsubscribeFirestore = onSnapshot(
    doc(db, 'users', userId),
    (snap) => {
      if (!snap.exists()) {
        emit(null);
        return;
      }
      const data = snap.data();
      emit({
        savedLists: (data.savedLists as string[] | undefined) ?? [],
        fcmTokens: (data.fcmTokens as string[] | undefined) ?? [],
        notificationsDisabled: data.notificationsDisabled === true,
      });
    },
    (err) => logger.error('User profile subscription error:', err)
  );
}

export function subscribeToUserProfile(userId: string, listener: UserProfileListener): () => void {
  if (activeUserId !== userId) {
    unsubscribeFirestore?.();
    unsubscribeFirestore = null;
    activeUserId = userId;
    startSubscription(userId);
  } else if (!unsubscribeFirestore) {
    startSubscription(userId);
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeFirestore?.();
      unsubscribeFirestore = null;
      activeUserId = null;
    }
  };
}
