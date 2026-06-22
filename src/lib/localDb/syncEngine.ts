import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';
import { getPendingMutations, removeMutation } from '@/lib/localDb/mutationQueue';
import { applyPendingMutation } from '@/lib/localDb/syncHandlers';
import { shouldDropStaleMutation } from '@/lib/localDb/syncMutationRecovery';

export interface FlushResult {
  syncedCount: number;
  remainingCount: number;
  lastError?: unknown;
  lastFailedMutation?: { id: string; type: string };
}

function isPermanentDeleteListFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String(error.code) : '';
  return code === 'functions/permission-denied' || code === 'permission-denied';
}

let flushChain: Promise<FlushResult> = Promise.resolve({
  syncedCount: 0,
  remainingCount: 0,
});
let listenersRegistered = false;

async function drainPendingMutations(): Promise<FlushResult> {
  let syncedCount = 0;
  let lastError: unknown;

  while (true) {
    const mutations = await getPendingMutations();
    if (mutations.length === 0) {
      return { syncedCount, remainingCount: 0, lastError };
    }

    let blockedOnFailure = false;
    let lastFailedMutation: FlushResult['lastFailedMutation'];
    for (const mutation of mutations) {
      try {
        await applyPendingMutation(mutation);
        await removeMutation(mutation.id);
        syncedCount += 1;
      } catch (error) {
        if (mutation.type === 'deleteList' && isPermanentDeleteListFailure(error)) {
          logger.warn(
            'Dropping deleteList mutation because the current user cannot delete this list:',
            mutation.entityId,
            error
          );
          await removeMutation(mutation.id);
          syncedCount += 1;
          continue;
        }

        if (await shouldDropStaleMutation(mutation, error)) {
          logger.warn('Dropping stale mutation that already exists on server:', mutation.id, error);
          await removeMutation(mutation.id);
          syncedCount += 1;
          continue;
        }

        logger.error('Failed to sync pending mutation:', mutation.id, mutation.type, error);
        lastError = error;
        lastFailedMutation = { id: mutation.id, type: mutation.type };
        blockedOnFailure = true;
        break;
      }
    }

    if (blockedOnFailure) {
      const remaining = await getPendingMutations();
      return { syncedCount, remainingCount: remaining.length, lastError, lastFailedMutation };
    }
  }
}

export interface FlushPendingMutationsOptions {
  /** When true, flush even if navigator.onLine is false (e.g. after a successful connectivity probe). */
  ignoreBrowserOffline?: boolean;
  /** When true, wait for any in-flight flush then run a fresh drain (manual retry). */
  force?: boolean;
}

export async function flushPendingMutations(
  options: FlushPendingMutationsOptions = {}
): Promise<FlushResult> {
  if (!options.ignoreBrowserOffline && !isBrowserOnline()) {
    const remaining = await getPendingMutations();
    return { syncedCount: 0, remainingCount: remaining.length };
  }

  if (options.force) {
    await flushChain;
    const drainPromise = drainPendingMutations();
    flushChain = drainPromise;
    return drainPromise;
  }

  flushChain = flushChain.then(() => drainPendingMutations());
  return flushChain;
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
