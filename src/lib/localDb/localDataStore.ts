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
  awaitPendingFlushSettlement,
  flushPendingMutations,
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
  /**
   * When false, skip flushing the mutation queue before clearing local state.
   * Required on account switch: Firebase auth already points at the new user, so
   * flushing would replay the previous user's queue under the wrong credentials.
   */
  flushPending?: boolean;
}

export async function resetLocalDataRuntime(
  options: ResetLocalDataRuntimeOptions = {}
): Promise<void> {
  const shouldFlushPending = options.flushPending !== false;
  if (shouldFlushPending && isBrowserOnline()) {
    await flushPendingMutations();
  } else {
    await awaitPendingFlushSettlement();
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
}
