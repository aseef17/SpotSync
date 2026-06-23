import { onAuthStateChanged } from 'firebase/auth';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { auth } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import { getPendingMutations, removeMutation } from '@/lib/localDb/mutationQueue';
import { applyPendingMutation } from '@/lib/localDb/syncHandlers';
import { shouldDropStaleMutation } from '@/lib/localDb/syncMutationRecovery';
import { syncDebug, syncDebugError } from '@/utils/syncDebug';

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

const EMPTY_FLUSH_RESULT: FlushResult = { syncedCount: 0, remainingCount: 0 };

let flushChain: Promise<FlushResult> = Promise.resolve(EMPTY_FLUSH_RESULT);
let listenersRegistered = false;
/** Tracks the last auth uid seen by the sync engine to detect first sign-in after boot. */
let lastObservedAuthUid: string | null = auth.currentUser?.uid ?? null;
/** Bumped when local runtime resets so in-flight drains stop before the DB is cleared. */
let drainGeneration = 0;

/** Invalidates any in-flight sync drain (e.g. account switch clearing local state). */
export function invalidateSyncDrain(): void {
  drainGeneration += 1;
}

/** Waits until the serialized flush chain has settled after invalidation. */
export async function awaitSyncDrainIdle(): Promise<void> {
  await flushChain;
}

function settleFlushResult(promise: Promise<FlushResult>, context: string): Promise<FlushResult> {
  return promise.catch(async (error) => {
    logger.error(`${context}:`, error);
    const remaining = await getPendingMutations();
    return {
      syncedCount: 0,
      remainingCount: remaining.length,
      lastError: error,
    };
  });
}

function isDrainStillValid(generationAtStart: number, ownerUid: string | null): boolean {
  return generationAtStart === drainGeneration && auth.currentUser?.uid === ownerUid;
}

async function drainPendingMutations(): Promise<FlushResult> {
  const generationAtStart = drainGeneration;
  const ownerUid = auth.currentUser?.uid ?? null;

  if (!ownerUid) {
    const remaining = await getPendingMutations();
    syncDebug('drain-skipped-no-auth', { remainingCount: remaining.length });
    return { syncedCount: 0, remainingCount: remaining.length };
  }

  let syncedCount = 0;
  let lastError: unknown;

  while (true) {
    if (!isDrainStillValid(generationAtStart, ownerUid)) {
      const remaining = await getPendingMutations();
      syncDebug('drain-aborted-runtime-reset', {
        ownerUid,
        remainingCount: remaining.length,
      });
      return { syncedCount, remainingCount: remaining.length, lastError };
    }

    const mutations = await getPendingMutations();
    if (mutations.length === 0) {
      return { syncedCount, remainingCount: 0, lastError };
    }

    syncDebug('drain-batch', {
      uid: ownerUid,
      count: mutations.length,
      types: mutations.map((m) => m.type),
    });

    let blockedOnFailure = false;
    let lastFailedMutation: FlushResult['lastFailedMutation'];
    for (const mutation of mutations) {
      if (!isDrainStillValid(generationAtStart, ownerUid)) {
        const remaining = await getPendingMutations();
        syncDebug('drain-aborted-runtime-reset', {
          ownerUid,
          remainingCount: remaining.length,
        });
        return { syncedCount, remainingCount: remaining.length, lastError };
      }

      try {
        syncDebug('mutation-apply-start', {
          id: mutation.id,
          type: mutation.type,
          entityId: mutation.entityId,
        });
        await applyPendingMutation(mutation);
        if (!isDrainStillValid(generationAtStart, ownerUid)) {
          const remaining = await getPendingMutations();
          syncDebug('drain-aborted-after-apply', {
            ownerUid,
            mutationId: mutation.id,
            remainingCount: remaining.length,
          });
          return { syncedCount, remainingCount: remaining.length, lastError };
        }
        await removeMutation(mutation.id);
        syncedCount += 1;
        syncDebug('mutation-apply-ok', { id: mutation.id, type: mutation.type });
      } catch (error) {
        syncDebugError('mutation-apply-failed', error, {
          id: mutation.id,
          type: mutation.type,
          entityId: mutation.entityId,
        });
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

        let dropStale = false;
        try {
          dropStale = await shouldDropStaleMutation(mutation, error);
          syncDebug('stale-check-result', {
            id: mutation.id,
            dropStale,
          });
        } catch (staleCheckError) {
          syncDebugError('stale-check-threw', staleCheckError, { id: mutation.id });
          logger.error(
            'Failed to check whether mutation is stale; keeping it queued:',
            mutation.id,
            staleCheckError
          );
        }

        if (dropStale) {
          syncDebug('mutation-dropped-stale', { id: mutation.id, type: mutation.type });
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
  /** Manual retry call sites set this; all flushes share the same serialized chain. */
  force?: boolean;
}

export async function flushPendingMutations(
  options: FlushPendingMutationsOptions = {}
): Promise<FlushResult> {
  if (!auth.currentUser?.uid) {
    const remaining = await getPendingMutations();
    return { syncedCount: 0, remainingCount: remaining.length };
  }

  if (!options.ignoreBrowserOffline && !isBrowserOnline()) {
    const remaining = await getPendingMutations();
    return { syncedCount: 0, remainingCount: remaining.length };
  }

  const context = options.force ? 'Manual sync drain failed' : 'Background sync drain failed';
  flushChain = settleFlushResult(
    flushChain.then(() => drainPendingMutations()),
    context
  );
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

  onAuthStateChanged(auth, (user) => {
    const nextUid = user?.uid ?? null;
    const authJustBecameReady = nextUid !== null && lastObservedAuthUid === null;
    lastObservedAuthUid = nextUid;

    if (authJustBecameReady && isBrowserOnline()) {
      void flushPendingMutations();
    }
  });

  if (isBrowserOnline()) {
    void flushPendingMutations();
  }
}
