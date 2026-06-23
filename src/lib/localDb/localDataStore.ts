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
  flushPendingMutations,
  startSyncEngine,
  waitForPendingFlushIdle,
} from '@/lib/localDb/syncEngine';
import { clearAllSubscriptions } from '@/lib/localDb/subscriptionRegistry';

let initPromise: Promise<void> | null = null;
let resetChain: Promise<void> = Promise.resolve();

export function waitForLocalDataResetIdle(): Promise<void> {
  return resetChain;
}

export async function initLocalDataStore(): Promise<void> {
  await waitForLocalDataResetIdle();

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
}

export async function resetLocalDataRuntime(
  options: ResetLocalDataRuntimeOptions = {}
): Promise<void> {
  const resetTask = resetChain.then(async () => {
    if (!options.skipPendingFlush && isBrowserOnline()) {
      await flushPendingMutations();
    } else {
      await waitForPendingFlushIdle();
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
  });

  resetChain = resetTask.catch(() => undefined);
  await resetTask;
}
