import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';
import { getPendingMutations, removeMutation } from '@/lib/localDb/mutationQueue';
import { applyPendingMutation } from '@/lib/localDb/syncHandlers';

let syncPromise: Promise<void> | null = null;
let listenersRegistered = false;

export async function flushPendingMutations(): Promise<void> {
  if (!isBrowserOnline()) {
    return;
  }

  if (syncPromise) {
    await syncPromise;
    return;
  }

  syncPromise = (async () => {
    const mutations = await getPendingMutations();
    for (const mutation of mutations) {
      try {
        await applyPendingMutation(mutation);
        await removeMutation(mutation.id);
      } catch (error) {
        logger.error('Failed to sync pending mutation:', mutation.id, error);
        break;
      }
    }
  })().finally(() => {
    syncPromise = null;
  });

  await syncPromise;
}

export function startSyncEngine(): void {
  if (listenersRegistered || typeof window === 'undefined') {
    return;
  }

  listenersRegistered = true;

  const handleOnline = () => {
    void flushPendingMutations();
  };

  window.addEventListener('online', handleOnline);

  if (isBrowserOnline()) {
    void flushPendingMutations();
  }
}
