import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isBrowserOnlineMock,
  flushPendingMutationsMock,
  abortSyncDrainMock,
  clearLocalDatabaseMock,
  initLocalDatabaseMock,
} = vi.hoisted(() => ({
  isBrowserOnlineMock: vi.fn(() => true),
  flushPendingMutationsMock: vi.fn().mockResolvedValue({ syncedCount: 0, remainingCount: 0 }),
  abortSyncDrainMock: vi.fn().mockResolvedValue(undefined),
  clearLocalDatabaseMock: vi.fn().mockResolvedValue(undefined),
  initLocalDatabaseMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: isBrowserOnlineMock,
}));

vi.mock('@/lib/localDb/syncEngine', () => ({
  flushPendingMutations: flushPendingMutationsMock,
  abortSyncDrain: abortSyncDrainMock,
  startSyncEngine: vi.fn(),
}));

vi.mock('@/lib/localDb/database', () => ({
  clearLocalDatabase: clearLocalDatabaseMock,
  initLocalDatabase: initLocalDatabaseMock,
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

vi.mock('@/lib/localDb/changeBus', () => ({
  clearAllChangeListeners: vi.fn(),
}));

vi.mock('@/lib/localDb/sync/listSync', () => ({
  clearAllUserListsSyncState: vi.fn(),
}));

vi.mock('@/lib/localDb/sync/userProfileSync', () => ({
  clearUserProfileSyncState: vi.fn(),
}));

vi.mock('@/lib/localDb/initialCacheHydration', () => ({
  clearCompletedHydrationScopes: vi.fn(),
}));

vi.mock('@/lib/localDb/subscriptionRegistry', () => ({
  clearAllSubscriptions: vi.fn(),
}));

describe('resetLocalDataRuntime', () => {
  beforeEach(async () => {
    vi.resetModules();
    isBrowserOnlineMock.mockReturnValue(true);
    flushPendingMutationsMock.mockClear();
    abortSyncDrainMock.mockClear();
    clearLocalDatabaseMock.mockClear();
  });

  it('flushes pending mutations before clearing local state by default', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime();

    expect(flushPendingMutationsMock).toHaveBeenCalledTimes(1);
    expect(abortSyncDrainMock).toHaveBeenCalledTimes(1);
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('skips flushing when flushPending is false (account switch)', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime({ flushPending: false });

    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(abortSyncDrainMock).toHaveBeenCalledTimes(1);
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('does not flush when offline even if flushPending is enabled', async () => {
    isBrowserOnlineMock.mockReturnValue(false);
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime();

    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(abortSyncDrainMock).toHaveBeenCalledTimes(1);
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });
});
