import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  flushPendingMutationsMock,
  invalidateSyncDrainMock,
  awaitSyncDrainIdleMock,
  beginLocalRuntimeResetMock,
  endLocalRuntimeResetMock,
  clearLocalDatabaseMock,
  initLocalDatabaseMock,
  isBrowserOnlineMock,
} = vi.hoisted(() => ({
  flushPendingMutationsMock: vi.fn(),
  invalidateSyncDrainMock: vi.fn(),
  awaitSyncDrainIdleMock: vi.fn(),
  beginLocalRuntimeResetMock: vi.fn(),
  endLocalRuntimeResetMock: vi.fn(),
  clearLocalDatabaseMock: vi.fn(),
  initLocalDatabaseMock: vi.fn(),
  isBrowserOnlineMock: vi.fn(() => true),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: isBrowserOnlineMock,
}));

vi.mock('@/lib/localDb/syncEngine', () => ({
  flushPendingMutations: flushPendingMutationsMock,
  invalidateSyncDrain: invalidateSyncDrainMock,
  awaitSyncDrainIdle: awaitSyncDrainIdleMock,
  beginLocalRuntimeReset: beginLocalRuntimeResetMock,
  endLocalRuntimeReset: endLocalRuntimeResetMock,
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
    invalidateSyncDrainMock.mockReset();
    awaitSyncDrainIdleMock.mockReset();
    beginLocalRuntimeResetMock.mockReset();
    endLocalRuntimeResetMock.mockReset();
    clearLocalDatabaseMock.mockReset();
    isBrowserOnlineMock.mockReturnValue(true);
    flushPendingMutationsMock.mockResolvedValue({ syncedCount: 0, remainingCount: 0 });
    awaitSyncDrainIdleMock.mockResolvedValue(undefined);
    clearLocalDatabaseMock.mockResolvedValue(undefined);
  });

  it('invalidates and awaits in-flight drains before clearing local state', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime({ skipPendingFlush: true });

    expect(invalidateSyncDrainMock).toHaveBeenCalledTimes(1);
    expect(awaitSyncDrainIdleMock).toHaveBeenCalledTimes(1);
    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('flushes pending mutations before clearing local state by default', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime();

    expect(invalidateSyncDrainMock).not.toHaveBeenCalled();
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

  it('wraps reset in a runtime lock so concurrent flushes cannot run mid-reset', async () => {
    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime({ skipPendingFlush: true });

    expect(beginLocalRuntimeResetMock).toHaveBeenCalledTimes(1);
    expect(endLocalRuntimeResetMock).toHaveBeenCalledTimes(1);
    expect(beginLocalRuntimeResetMock.mock.invocationCallOrder[0]).toBeLessThan(
      clearLocalDatabaseMock.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(endLocalRuntimeResetMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      clearLocalDatabaseMock.mock.invocationCallOrder[0] ?? -1
    );
  });

  it('does not flush when offline even without skipPendingFlush', async () => {
    isBrowserOnlineMock.mockReturnValue(false);

    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime();

    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });
});
