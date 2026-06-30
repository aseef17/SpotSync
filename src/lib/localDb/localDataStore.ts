import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { clearInvitationListSubscriptions } from '@/features/lists/api/invitationListSubscriptionStore';
import { clearInvitationRecipientSubscriptions } from '@/features/lists/api/invitationRecipientSubscriptionStore';
import { clearPlaceListSubscriptions } from '@/features/places/api/placeListSubscriptionStore';
import { clearLocalDatabase, initLocalDatabase } from '@/lib/localDb/database';
import { clearCompletedHydrationScopes } from '@/lib/localDb/initialCacheHydration';
import { clearAllChangeListeners } from '@/lib/localDb/changeBus';
import { clearAllUserListsSyncState } from '@/lib/localDb/sync/listSync';
import { clearUserProfileSyncState } from '@/lib/localDb/sync/userProfileSync';
import {
  awaitSyncDrainIdle,
  beginLocalRuntimeReset,
  beginUnscopedLocalRuntimeReset,
  endLocalRuntimeReset,
  flushPendingMutations,
  invalidateSyncDrain,
  ownsRuntimeResetLock,
  startSyncEngine,
} from '@/lib/localDb/syncEngine';
import { clearAllSubscriptions } from '@/lib/localDb/subscriptionRegistry';

let initPromise: Promise<void> | null = null;

export async function initLocalDataStore(): Promise<void> {
  if (!initPromise) {
    initPromise = initLocalDatabase()
      .then(() => {
        startSyncEngine();
      })
      .catch((error) => {
        initPromise = null;
        throw error;
      });
  }

  await initPromise;
}

export interface ResetLocalDataRuntimeOptions {
  /** Skip draining the mutation queue before clearing local state (e.g. account switch). */
  skipPendingFlush?: boolean;
  /** Auth handler generation that owns the early account-switch reset lock. */
  lockGeneration?: number;
  /** When true, skip destructive cleanup (e.g. superseded auth handler or cross-tab sign-in). */
  shouldAbort?: () => boolean;
}

function shouldAbortReset(options: ResetLocalDataRuntimeOptions): boolean {
  return options.shouldAbort?.() === true;
}

export async function resetLocalDataRuntime(
  options: ResetLocalDataRuntimeOptions = {}
): Promise<void> {
  const { lockGeneration } = options;

  if (lockGeneration !== undefined) {
    beginLocalRuntimeReset(lockGeneration);
  } else {
    beginUnscopedLocalRuntimeReset();
  }

  try {
    // Account switch must abort in-flight drains before clearing local state. Logout/sign-out
    // should let the active drain finish so applied mutations are dequeued before we flush again.
    if (options.skipPendingFlush) {
      invalidateSyncDrain();
    }
    await awaitSyncDrainIdle();

    if (!ownsRuntimeResetLock(lockGeneration) || shouldAbortReset(options)) {
      return;
    }

    if (!options.skipPendingFlush && isBrowserOnline()) {
      await flushPendingMutations({ allowDuringRuntimeReset: true });
    }

    if (!ownsRuntimeResetLock(lockGeneration) || shouldAbortReset(options)) {
      return;
    }

    clearPlaceListSubscriptions();
    clearInvitationListSubscriptions();
    clearInvitationRecipientSubscriptions();
    clearAllSubscriptions();
    clearAllChangeListeners();
    clearAllUserListsSyncState();
    clearUserProfileSyncState();
    clearCompletedHydrationScopes();
    initPromise = null;
    await clearLocalDatabase();
  } finally {
    endLocalRuntimeReset(lockGeneration);
  }
}
