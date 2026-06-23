import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  flushPendingMutationsMock,
  beginLocalRuntimeResetMock,
  endLocalRuntimeResetMock,
  awaitSyncDrainIdleMock,
  clearLocalDatabaseMock,
  initLocalDatabaseMock,
  isBrowserOnlineMock,
} = vi.hoisted(() => ({
  flushPendingMutationsMock: vi.fn(),
  beginLocalRuntimeResetMock: vi.fn(),
  endLocalRuntimeResetMock: vi.fn(),
  awaitSyncDrainIdleMock: vi.fn(),
  clearLocalDatabaseMock: vi.fn(),
  initLocalDatabaseMock: vi.fn(),
  isBrowserOnlineMock: vi.fn(() => true),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: isBrowserOnlineMock,
}));

vi.mock('@/lib/localDb/syncEngine', () => ({
  flushPendingMutations: flushPendingMutationsMock,
  beginLocalRuntimeReset: beginLocalRuntimeResetMock,
  endLocalRuntimeReset: endLocalRuntimeResetMock,
  awaitSyncDrainIdle: awaitSyncDrainIdleMock,
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
    beginLocalRuntimeResetMock.mockReset();
    endLocalRuntimeResetMock.mockReset();
    awaitSyncDrainIdleMock.mockReset();
    clearLocalDatabaseMock.mockReset();
    isBrowserOnlineMock.mockReturnValue(true);
    flushPendingMutationsMock.mockResolvedValue({ syncedCount: 0, remainingCount: 0 });
    awaitSyncDrainIdleMock.mockResolvedValue(undefined);
    clearLocalDatabaseMock.mockResolvedValue(undefined);
  });

  it('invalidates and awaits in-flight drains before clearing local state', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime({ skipPendingFlush: true });

    expect(beginLocalRuntimeResetMock).toHaveBeenCalledWith({ invalidateDrain: true });
    expect(endLocalRuntimeResetMock).toHaveBeenCalledTimes(1);
    expect(awaitSyncDrainIdleMock).toHaveBeenCalledTimes(1);
    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('flushes pending mutations before clearing local state by default', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime();

    expect(beginLocalRuntimeResetMock).toHaveBeenCalledWith({ invalidateDrain: undefined });
    expect(endLocalRuntimeResetMock).toHaveBeenCalledTimes(1);
    expect(awaitSyncDrainIdleMock).toHaveBeenCalledTimes(1);
    expect(flushPendingMutationsMock).toHaveBeenCalledWith({ allowDuringRuntimeReset: true });
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
