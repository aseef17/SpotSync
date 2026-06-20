import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';
import { getPendingMutations, removeMutation } from '@/lib/localDb/mutationQueue';
import { applyPendingMutation } from '@/lib/localDb/syncHandlers';

function isPermanentDeleteListFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String(error.code) : '';
  return code === 'functions/permission-denied' || code === 'permission-denied';
}

let flushChain: Promise<void> = Promise.resolve();
let listenersRegistered = false;

async function drainPendingMutations(): Promise<void> {
  while (true) {
    const mutations = await getPendingMutations();
    if (mutations.length === 0) {
      return;
    }

    let blockedOnFailure = false;
    for (const mutation of mutations) {
      try {
        await applyPendingMutation(mutation);
        await removeMutation(mutation.id);
      } catch (error) {
        if (mutation.type === 'deleteList' && isPermanentDeleteListFailure(error)) {
          logger.warn(
            'Dropping deleteList mutation because the current user cannot delete this list:',
            mutation.entityId,
            error
          );
          await removeMutation(mutation.id);
          continue;
        }

        logger.error('Failed to sync pending mutation:', mutation.id, error);
        blockedOnFailure = true;
        break;
      }
    }

    if (blockedOnFailure) {
      return;
    }
  }
}

export async function flushPendingMutations(): Promise<void> {
  if (!isBrowserOnline()) {
    return;
  }

  flushChain = flushChain.then(() => drainPendingMutations());
  await flushChain;
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
