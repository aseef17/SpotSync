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
  endLocalRuntimeReset,
  flushPendingMutations,
  invalidateSyncDrain,
  isLocalRuntimeResetLockOwner,
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
  /** Auth handler generation for account-switch resets; scopes lock ownership and release. */
  lockGeneration?: number;
}

export async function resetLocalDataRuntime(
  options: ResetLocalDataRuntimeOptions = {}
): Promise<void> {
  const { skipPendingFlush = false, lockGeneration } = options;
  beginLocalRuntimeReset(lockGeneration);

  try {
    if (!isLocalRuntimeResetLockOwner(lockGeneration)) {
      return;
    }

    // Account switch must abort in-flight drains before clearing local state. Logout/sign-out
    // should let the active drain finish so applied mutations are dequeued before we flush again.
    if (skipPendingFlush) {
      invalidateSyncDrain();
    }
    await awaitSyncDrainIdle();

    if (!isLocalRuntimeResetLockOwner(lockGeneration)) {
      return;
    }

    if (!skipPendingFlush && isBrowserOnline()) {
      await flushPendingMutations({ allowDuringRuntimeReset: true });
    }

    if (!isLocalRuntimeResetLockOwner(lockGeneration)) {
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
