import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  flushPendingMutationsMock,
  clearLocalDatabaseMock,
  initLocalDatabaseMock,
  isBrowserOnlineMock,
} = vi.hoisted(() => ({
  flushPendingMutationsMock: vi.fn(),
  clearLocalDatabaseMock: vi.fn(),
  initLocalDatabaseMock: vi.fn(),
  isBrowserOnlineMock: vi.fn(() => true),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: isBrowserOnlineMock,
}));

vi.mock('@/lib/localDb/syncEngine', () => ({
  flushPendingMutations: flushPendingMutationsMock,
  startSyncEngine: vi.fn(),
}));

vi.mock('@/lib/localDb/database', () => ({
  initLocalDatabase: initLocalDatabaseMock,
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

describe('resetLocalDataRuntime', () => {
  beforeEach(async () => {
    vi.resetModules();
    flushPendingMutationsMock.mockReset();
    clearLocalDatabaseMock.mockReset();
    isBrowserOnlineMock.mockReturnValue(true);
    flushPendingMutationsMock.mockResolvedValue({ syncedCount: 0, remainingCount: 0 });
    clearLocalDatabaseMock.mockResolvedValue(undefined);
  });

  it('flushes pending mutations before clearing local state by default', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime();

    expect(flushPendingMutationsMock).toHaveBeenCalledTimes(1);
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('skips flushing when skipPendingFlush is set (account switch)', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime({ skipPendingFlush: true });

    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('does not flush when offline even without skipPendingFlush', async () => {
    isBrowserOnlineMock.mockReturnValue(false);

    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime();

    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });
});
