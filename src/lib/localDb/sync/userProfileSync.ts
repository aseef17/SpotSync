import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import { changeTopics, emitChange } from '@/lib/localDb/changeBus';
import { acquireSubscription } from '@/lib/localDb/subscriptionRegistry';
import { upsertCachedUser } from '@/lib/localDb/userCache';
import { setUserSavedListIds } from '@/lib/localDb/sync/listSync';
import type { User } from '@/features/auth/types/user';

const lastSavedListIdsKeyByUser = new Map<string, string>();

export function clearUserProfileSyncState(): void {
  lastSavedListIdsKeyByUser.clear();
}

export function acquireUserProfileSync(userId: string): () => void {
  return acquireSubscription(`sync:user:${userId}`, () => {
    return onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        void (async () => {
          if (!snap.exists()) {
            emitChange(changeTopics.user(userId));
            return;
          }

          const data = snap.data();
          const user: User = {
            id: userId,
            email: (data.email as string | undefined) ?? '',
            displayName: (data.displayName as string | undefined) ?? '',
            username: (data.username as string | undefined) ?? '',
            photoURL: data.photoURL as string | undefined,
            bio: data.bio as string | undefined,
            location: data.location as string | undefined,
            savedLists: (data.savedLists as string[] | undefined) ?? [],
            fcmTokens: (data.fcmTokens as string[] | undefined) ?? [],
            notificationsDisabled: data.notificationsDisabled === true,
            theme: data.theme as 'light' | 'dark' | undefined,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
          };

          await upsertCachedUser(user);

          const savedListIds = user.savedLists ?? [];
          const idsKey = savedListIds.join('|');
          if (lastSavedListIdsKeyByUser.get(userId) !== idsKey) {
            lastSavedListIdsKeyByUser.set(userId, idsKey);
            setUserSavedListIds(userId, savedListIds);
          }

          emitChange(changeTopics.user(userId));
        })();
      },
      (error) => {
        logger.error('User profile sync subscription error:', error);
      }
    );
  });
}
