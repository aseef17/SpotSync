import { getCachedUser } from '@/lib/localDb/userCache';
import { changeTopics, subscribeToChanges } from '@/lib/localDb/changeBus';
import { acquireUserProfileSync } from '@/lib/localDb/sync/userProfileSync';

export interface UserProfileSnapshot {
  savedLists: string[];
  fcmTokens: string[];
  notificationsDisabled: boolean;
}

type UserProfileListener = (profile: UserProfileSnapshot | null) => void;

let activeUserId: string | null = null;
let releaseProfileSync: (() => void) | null = null;
const listeners = new Set<UserProfileListener>();

function toProfileSnapshot(data: {
  savedLists?: string[];
  fcmTokens?: string[];
  notificationsDisabled?: boolean;
}): UserProfileSnapshot {
  const rawTokens = data.fcmTokens;
  const fcmTokens = Array.isArray(rawTokens)
    ? rawTokens.filter((token): token is string => typeof token === 'string')
    : [];

  return {
    savedLists: data.savedLists ?? [],
    fcmTokens,
    notificationsDisabled: data.notificationsDisabled === true,
  };
}

function emitFromCache(userId: string) {
  void (async () => {
    const user = await getCachedUser(userId);
    const profile = user
      ? toProfileSnapshot({
          savedLists: user.savedLists,
          fcmTokens: user.fcmTokens,
          notificationsDisabled: user.notificationsDisabled,
        })
      : null;
    listeners.forEach((listener) => listener(profile));
  })();
}

function startSubscription(userId: string) {
  emitFromCache(userId);
  releaseProfileSync = acquireUserProfileSync(userId);
}

/** Read profile from local cache + change bus only (no Firestore listener). */
export function subscribeToUserProfileCacheOnly(
  userId: string,
  listener: UserProfileListener
): () => void {
  listeners.add(listener);
  emitFromCache(userId);

  const unsubscribeChanges = subscribeToChanges(changeTopics.user(userId), () => {
    emitFromCache(userId);
  });

  return () => {
    listeners.delete(listener);
    unsubscribeChanges();
  };
}

export function subscribeToUserProfile(userId: string, listener: UserProfileListener): () => void {
  if (activeUserId !== userId) {
    releaseProfileSync?.();
    releaseProfileSync = null;
    activeUserId = userId;
    startSubscription(userId);
  } else if (!releaseProfileSync) {
    startSubscription(userId);
  }

  listeners.add(listener);
  emitFromCache(userId);

  const unsubscribeChanges = subscribeToChanges(changeTopics.user(userId), () => {
    emitFromCache(userId);
  });

  return () => {
    listeners.delete(listener);
    unsubscribeChanges();
    if (listeners.size === 0) {
      releaseProfileSync?.();
      releaseProfileSync = null;
      activeUserId = null;
    }
  };
}
