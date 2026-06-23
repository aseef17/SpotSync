import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  flushPendingMutationsMock,
  waitForPendingFlushIdleMock,
  clearLocalDatabaseMock,
  initLocalDatabaseMock,
  isBrowserOnlineMock,
} = vi.hoisted(() => ({
  flushPendingMutationsMock: vi.fn(),
  waitForPendingFlushIdleMock: vi.fn(),
  clearLocalDatabaseMock: vi.fn(),
  initLocalDatabaseMock: vi.fn(),
  isBrowserOnlineMock: vi.fn(() => true),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: isBrowserOnlineMock,
}));

vi.mock('@/lib/localDb/syncEngine', () => ({
  flushPendingMutations: flushPendingMutationsMock,
  waitForPendingFlushIdle: waitForPendingFlushIdleMock,
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
    waitForPendingFlushIdleMock.mockReset();
    clearLocalDatabaseMock.mockReset();
    isBrowserOnlineMock.mockReturnValue(true);
    flushPendingMutationsMock.mockResolvedValue({ syncedCount: 0, remainingCount: 0 });
    waitForPendingFlushIdleMock.mockResolvedValue({ syncedCount: 0, remainingCount: 0 });
    clearLocalDatabaseMock.mockResolvedValue(undefined);
    initLocalDatabaseMock.mockResolvedValue(undefined);
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
    expect(waitForPendingFlushIdleMock).toHaveBeenCalledTimes(1);
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('waits for in-flight flush idle when offline without starting a new flush', async () => {
    isBrowserOnlineMock.mockReturnValue(false);

    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await resetLocalDataRuntime();

    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(waitForPendingFlushIdleMock).toHaveBeenCalledTimes(1);
    expect(clearLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('serializes overlapping resets before clearing local state', async () => {
    const callOrder: string[] = [];
    clearLocalDatabaseMock.mockImplementation(async () => {
      callOrder.push('clear');
    });
    flushPendingMutationsMock.mockImplementation(async () => {
      callOrder.push('flush');
      return { syncedCount: 0, remainingCount: 0 };
    });

    const { resetLocalDataRuntime } = await import('@/lib/localDb/localDataStore');

    await Promise.all([resetLocalDataRuntime(), resetLocalDataRuntime()]);

    expect(callOrder).toEqual(['flush', 'clear', 'flush', 'clear']);
  });

  it('initLocalDataStore waits for an in-flight reset before initializing', async () => {
    let releaseClear!: () => void;
    const clearGate = new Promise<void>((resolve) => {
      releaseClear = resolve;
    });
    clearLocalDatabaseMock.mockImplementation(() => clearGate);

    const { resetLocalDataRuntime, initLocalDataStore } = await import('@/lib/localDb/localDataStore');

    const resetPromise = resetLocalDataRuntime();
    await flushPendingMutationsMock.mock.results[0]?.value;
    const initPromise = initLocalDataStore();

    expect(initLocalDatabaseMock).not.toHaveBeenCalled();

    releaseClear();
    await Promise.all([resetPromise, initPromise]);

    expect(initLocalDatabaseMock).toHaveBeenCalledTimes(1);
  });
});
