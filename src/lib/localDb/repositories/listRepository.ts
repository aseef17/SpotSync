import type { PlaceList } from '@/features/lists/types/list';
import {
  applyPendingMutationsToLists,
  getCachedList,
  getCachedUserLists,
  getPendingMutations,
} from '@/lib/localDb';
import { changeTopics, subscribeToChanges } from '@/lib/localDb/changeBus';
import {
  acquireListSync,
  acquireUserOwnedListsSync,
  clearUserListsSyncState,
} from '@/lib/localDb/sync/listSync';
import {
  acquireUserProfileSync,
  clearUserSavedListIdsDedupForUser,
} from '@/lib/localDb/sync/userProfileSync';
import { consumeListPublishFromCache } from '@/lib/localDb/sync/listPublishMeta';

async function readUserLists(userId: string): Promise<PlaceList[]> {
  const cached = await getCachedUserLists(userId);
  if (!cached) {
    return [];
  }

  const pendingMutations = await getPendingMutations();
  return applyPendingMutationsToLists(cached, pendingMutations);
}

async function readList(listId: string): Promise<PlaceList | null> {
  const cached = await getCachedList(listId);
  if (!cached) {
    return null;
  }

  const pendingMutations = await getPendingMutations();
  const [withPending] = applyPendingMutationsToLists([cached], pendingMutations);
  return withPending ?? null;
}

export interface SubscribeToUserListsOptions {
  /** Start a live Firestore listener for owned/collaborated lists. */
  enableSync?: boolean;
  /** Start profile sync so saved list IDs stay current (dashboard only). */
  includeProfileSync?: boolean;
}

export const listRepository = {
  async getById(listId: string): Promise<PlaceList | null> {
    return readList(listId);
  },

  async getForUser(userId: string): Promise<PlaceList[]> {
    return readUserLists(userId);
  },

  subscribeToUserLists(
    userId: string,
    onUpdate: (lists: PlaceList[]) => void,
    onError: (error: Error) => void,
    options?: SubscribeToUserListsOptions
  ): () => void {
    let cancelled = false;
    const enableSync = options?.enableSync !== false;
    const includeProfileSync = options?.includeProfileSync === true;

    const publish = async () => {
      if (cancelled) {
        return;
      }

      try {
        const lists = await readUserLists(userId);
        onUpdate(lists);
      } catch (error) {
        onError(
          error instanceof Error ? error : new Error('Failed to read lists from local store')
        );
      }
    };

    void publish();

    const releaseOwnedListsSync = enableSync ? acquireUserOwnedListsSync(userId) : () => {};
    const releaseProfileSync = includeProfileSync ? acquireUserProfileSync(userId) : () => {};
    const unsubscribeChanges = subscribeToChanges(changeTopics.userLists(userId), () => {
      void publish();
    });

    return () => {
      cancelled = true;
      releaseOwnedListsSync();
      releaseProfileSync();
      unsubscribeChanges();
      if (enableSync || includeProfileSync) {
        clearUserListsSyncState(userId);
        clearUserSavedListIdsDedupForUser(userId);
      }
    };
  },

  subscribeToList(
    listId: string,
    onUpdate: (list: PlaceList | null, meta: { fromCache: boolean }) => void,
    onError: (error: Error) => void
  ): () => void {
    let cancelled = false;
    let publishGeneration = 0;

    const publish = async (fromCache: boolean) => {
      if (cancelled) {
        return;
      }

      const generation = ++publishGeneration;

      try {
        const list = await readList(listId);
        if (cancelled || generation !== publishGeneration) {
          return;
        }
        onUpdate(list, { fromCache });
      } catch (error) {
        if (cancelled || generation !== publishGeneration) {
          return;
        }
        onError(error instanceof Error ? error : new Error('Failed to read list from local store'));
      }
    };

    void publish(true);

    const releaseSync = acquireListSync(listId);
    const unsubscribeChanges = subscribeToChanges(changeTopics.list(listId), () => {
      void publish(consumeListPublishFromCache(listId));
    });

    return () => {
      cancelled = true;
      releaseSync();
      unsubscribeChanges();
    };
  },
};
