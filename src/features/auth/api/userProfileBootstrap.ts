import type { User } from '@/features/auth/types/user';
import { applyPendingMutationsToUser, getCachedUser, getPendingMutations } from '@/lib/localDb';
import { changeTopics, subscribeToChanges } from '@/lib/localDb/changeBus';
import { acquireUserProfileSync } from '@/lib/localDb/sync/userProfileSync';

export async function readUserProfileFromCache(userId: string): Promise<User | null> {
  const cached = await getCachedUser(userId);
  if (!cached) {
    return null;
  }

  const pendingMutations = await getPendingMutations();
  return applyPendingMutationsToUser(cached, pendingMutations);
}

export function waitForCachedUserProfile(userId: string, timeoutMs = 8000): Promise<User | null> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (user: User | null) => {
      if (settled) {
        return;
      }
      settled = true;
      releaseSync();
      unsubscribeChanges();
      window.clearTimeout(timeoutId);
      resolve(user);
    };

    const tryRead = async (): Promise<boolean> => {
      const profile = await readUserProfileFromCache(userId);
      if (profile) {
        finish(profile);
        return true;
      }
      return false;
    };

    void tryRead();

    const releaseSync = acquireUserProfileSync(userId);
    const unsubscribeChanges = subscribeToChanges(changeTopics.user(userId), () => {
      void tryRead();
    });

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        finish(await readUserProfileFromCache(userId));
      })();
    }, timeoutMs);
  });
}
