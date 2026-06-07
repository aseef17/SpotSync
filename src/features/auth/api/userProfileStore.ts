import { doc, getDocFromCache, onSnapshot } from 'firebase/firestore';
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

function toProfileSnapshot(data: Record<string, unknown>): UserProfileSnapshot {
  return {
    savedLists: (data.savedLists as string[] | undefined) ?? [],
    fcmTokens: (data.fcmTokens as string[] | undefined) ?? [],
    notificationsDisabled: data.notificationsDisabled === true,
  };
}

function emit(data: UserProfileSnapshot | null) {
  listeners.forEach((listener) => listener(data));
}

async function hydrateFromCache(userId: string) {
  try {
    const snap = await getDocFromCache(doc(db, 'users', userId));
    if (snap.exists()) {
      emit(toProfileSnapshot(snap.data()));
    }
  } catch {
    // Profile not cached yet.
  }
}

function startSubscription(userId: string) {
  void hydrateFromCache(userId);

  unsubscribeFirestore = onSnapshot(
    doc(db, 'users', userId),
    (snap) => {
      if (!snap.exists()) {
        emit(null);
        return;
      }
      emit(toProfileSnapshot(snap.data()));
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
