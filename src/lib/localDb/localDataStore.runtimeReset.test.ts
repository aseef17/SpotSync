import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearLocalDatabaseMock, authMock } = vi.hoisted(() => ({
  clearLocalDatabaseMock: vi.fn(),
  authMock: { currentUser: { uid: 'user-1' } as { uid: string } | null },
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: vi.fn(() => true),
}));

vi.mock('@/lib/firebase', () => ({
  auth: authMock,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}));

vi.mock('@/lib/localDb/mutationQueue', () => ({
  getPendingMutations: vi.fn().mockResolvedValue([]),
  removeMutation: vi.fn(),
}));

vi.mock('@/lib/localDb/syncHandlers', () => ({
  applyPendingMutation: vi.fn(),
}));

vi.mock('@/lib/localDb/syncMutationRecovery', () => ({
  shouldDropStaleMutation: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/utils/syncDebug', () => ({
  syncDebug: vi.fn(),
  syncDebugError: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/localDb/database', () => ({
  initLocalDatabase: vi.fn(),
  clearLocalDatabase: clearLocalDatabaseMock,
}));

vi.mock('@/features/lists/api/invitationListSubscriptionStore', () => ({
  clearInvitationListSubscriptions: vi.fn(),
}));

vi.mock('@/features/lists/api/invitationRecipientSubscriptionStore', () => ({
  clearInvitationRecipientSubscriptions: vi.fn(),
}));

vi.mock('@/features/places/api/placeListSubscriptionStore', () => ({
  clearPlaceListSubscriptions: vi.fn(),
}));

vi.mock('@/lib/localDb/initialCacheHydration', () => ({
  clearCompletedHydrationScopes: vi.fn(),
}));

vi.mock('@/lib/localDb/changeBus', () => ({
  clearAllChangeListeners: vi.fn(),
}));

vi.mock('@/lib/localDb/sync/listSync', () => ({
  clearAllUserListsSyncState: vi.fn(),
}));

vi.mock('@/lib/localDb/sync/userProfileSync', () => ({
  clearUserProfileSyncState: vi.fn(),
}));

vi.mock('@/lib/localDb/subscriptionRegistry', () => ({
  clearAllSubscriptions: vi.fn(),
}));

describe('resetLocalDataRuntime generation lock', () => {
  beforeEach(async () => {
    vi.resetModules();
    clearLocalDatabaseMock.mockReset();
    clearLocalDatabaseMock.mockResolvedValue(undefined);
    authMock.currentUser = { uid: 'user-1' };

    const syncEngine = await import('@/lib/localDb/syncEngine');
    syncEngine.resetLocalRuntimeResetLockForTests();
  });

  it('does not clear local data when a newer auth handler owns the reset lock', async () => {
    const syncEngine = await import('@/lib/localDb/syncEngine');
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    syncEngine.beginLocalRuntimeReset(1);
    syncEngine.beginLocalRuntimeReset(2);

    await resetLocalDataRuntime({ skipPendingFlush: true, lockGeneration: 1 });

    expect(clearLocalDatabaseMock).not.toHaveBeenCalled();
    syncEngine.endLocalRuntimeReset(2);
  });

  it('releases only the matching generation after a scoped account-switch reset', async () => {
    const syncEngine = await import('@/lib/localDb/syncEngine');
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    syncEngine.beginLocalRuntimeReset(1);

    await resetLocalDataRuntime({ skipPendingFlush: true, lockGeneration: 1 });

    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
    expect(syncEngine.ownsRuntimeResetLock(1)).toBe(false);
  });

  it('skips clearing local data when shouldAbort returns true mid-reset', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime({
      skipPendingFlush: true,
      shouldAbort: () => true,
    });

    expect(clearLocalDatabaseMock).not.toHaveBeenCalled();
  });
});
