import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getPendingMutationsMock,
  removeMutationMock,
  applyPendingMutationMock,
  isBrowserOnlineMock,
  authMock,
  onAuthStateChangedMock,
} = vi.hoisted(() => ({
  getPendingMutationsMock: vi.fn(),
  removeMutationMock: vi.fn(),
  applyPendingMutationMock: vi.fn(),
  isBrowserOnlineMock: vi.fn(() => true),
  authMock: { currentUser: { uid: 'user-1' } as { uid: string } | null },
  onAuthStateChangedMock: vi.fn(),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: isBrowserOnlineMock,
}));

vi.mock('@/lib/firebase', () => ({
  auth: authMock,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: onAuthStateChangedMock,
}));

vi.mock('@/utils/syncDebug', () => ({
  syncDebug: vi.fn(),
  syncDebugError: vi.fn(),
}));

vi.mock('@/lib/localDb/mutationQueue', () => ({
  getPendingMutations: getPendingMutationsMock,
  removeMutation: removeMutationMock,
}));

vi.mock('@/lib/localDb/syncHandlers', () => ({
  applyPendingMutation: applyPendingMutationMock,
}));

vi.mock('@/lib/localDb/syncMutationRecovery', () => ({
  shouldDropStaleMutation: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

type PendingMutation = { id: string; type: string; entityId: string; payload: unknown };

function mutation(id: string): PendingMutation {
  return { id, type: 'updatePlace', entityId: id, payload: {} };
}

describe('flushPendingMutations', () => {
  beforeEach(async () => {
    vi.resetModules();
    getPendingMutationsMock.mockReset();
    removeMutationMock.mockReset();
    applyPendingMutationMock.mockReset();
    isBrowserOnlineMock.mockReturnValue(true);
    authMock.currentUser = { uid: 'user-1' };
    removeMutationMock.mockResolvedValue(undefined);
    applyPendingMutationMock.mockResolvedValue(undefined);
  });

  it('drains mutations enqueued while another flush is in progress', async () => {
    const pending = new Set(['first']);

    getPendingMutationsMock.mockImplementation(async () => Array.from(pending).map(mutation));

    removeMutationMock.mockImplementation(async (id: string) => {
      pending.delete(id);
    });

    applyPendingMutationMock.mockImplementation(async (mutationToApply: PendingMutation) => {
      if (mutationToApply.id === 'first') {
        pending.add('second');
      }
    });

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');

    const [firstResult, secondResult] = await Promise.all([
      flushPendingMutations(),
      flushPendingMutations(),
    ]);

    expect(applyPendingMutationMock).toHaveBeenCalledTimes(2);
    expect(removeMutationMock).toHaveBeenCalledWith('first');
    expect(removeMutationMock).toHaveBeenCalledWith('second');
    expect(firstResult).toEqual({ syncedCount: 2, remainingCount: 0 });
    expect(secondResult).toEqual({ syncedCount: 0, remainingCount: 0 });
  });

  it('does not flush when auth is not ready', async () => {
    authMock.currentUser = null;
    getPendingMutationsMock.mockResolvedValue([mutation('first')]);

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');
    const result = await flushPendingMutations();

    expect(applyPendingMutationMock).not.toHaveBeenCalled();
    expect(result).toEqual({ syncedCount: 0, remainingCount: 1 });
  });

  it('does not flush when offline', async () => {
    isBrowserOnlineMock.mockReturnValue(false);
    getPendingMutationsMock.mockResolvedValue([mutation('first')]);

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');
    const result = await flushPendingMutations();

    expect(applyPendingMutationMock).not.toHaveBeenCalled();
    expect(result).toEqual({ syncedCount: 0, remainingCount: 1 });
  });

  it('flushes when offline if ignoreBrowserOffline is set', async () => {
    isBrowserOnlineMock.mockReturnValue(false);
    getPendingMutationsMock.mockResolvedValueOnce([mutation('first')]).mockResolvedValueOnce([]);

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');
    const result = await flushPendingMutations({ ignoreBrowserOffline: true });

    expect(applyPendingMutationMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ syncedCount: 1, remainingCount: 0 });
  });

  it('runs a fresh drain when force is set', async () => {
    getPendingMutationsMock
      .mockResolvedValueOnce([mutation('first')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mutation('second')])
      .mockResolvedValueOnce([]);

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');

    await flushPendingMutations();
    const forced = await flushPendingMutations({ force: true });

    expect(applyPendingMutationMock).toHaveBeenCalledTimes(2);
    expect(forced).toEqual({ syncedCount: 1, remainingCount: 0 });
  });

  it('serializes concurrent force flushes so mutations are not applied twice', async () => {
    const pending = new Set(['only']);

    getPendingMutationsMock.mockImplementation(async () => Array.from(pending).map(mutation));

    removeMutationMock.mockImplementation(async (id: string) => {
      pending.delete(id);
    });

    applyPendingMutationMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');

    await Promise.all([
      flushPendingMutations({ force: true }),
      flushPendingMutations({ force: true }),
    ]);

    expect(applyPendingMutationMock).toHaveBeenCalledTimes(1);
  });

  it('serializes force flush with an in-flight non-force flush', async () => {
    const pending = new Set(['only']);

    getPendingMutationsMock.mockImplementation(async () => Array.from(pending).map(mutation));

    removeMutationMock.mockImplementation(async (id: string) => {
      pending.delete(id);
    });

    applyPendingMutationMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');

    await Promise.all([flushPendingMutations(), flushPendingMutations({ force: true })]);

    expect(applyPendingMutationMock).toHaveBeenCalledTimes(1);
  });

  it('recovers the flush chain after a drain throws', async () => {
    getPendingMutationsMock
      .mockRejectedValueOnce(new Error('db read failed'))
      .mockResolvedValueOnce([mutation('still')])
      .mockResolvedValueOnce([mutation('still')])
      .mockResolvedValueOnce([]);

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');

    const failed = await flushPendingMutations();
    expect(failed.lastError).toBeInstanceOf(Error);
    expect(failed.remainingCount).toBe(1);

    const recovered = await flushPendingMutations();
    expect(applyPendingMutationMock).toHaveBeenCalledTimes(1);
    expect(recovered).toEqual({ syncedCount: 1, remainingCount: 0 });
  });

  it('stops at the first failed mutation without dropping earlier successes', async () => {
    getPendingMutationsMock
      .mockResolvedValueOnce([mutation('ok'), mutation('fail')])
      .mockResolvedValueOnce([mutation('fail')]);

    applyPendingMutationMock.mockImplementation(async (pending: PendingMutation) => {
      if (pending.id === 'fail') {
        throw new Error('sync failed');
      }
    });

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');
    const result = await flushPendingMutations();

    expect(removeMutationMock).toHaveBeenCalledWith('ok');
    expect(removeMutationMock).not.toHaveBeenCalledWith('fail');
    expect(applyPendingMutationMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      syncedCount: 1,
      remainingCount: 1,
      lastError: expect.any(Error),
      lastFailedMutation: { id: 'fail', type: 'updatePlace' },
    });
  });
});

describe('startSyncEngine', () => {
  beforeEach(async () => {
    vi.resetModules();
    getPendingMutationsMock.mockReset();
    removeMutationMock.mockReset();
    applyPendingMutationMock.mockReset();
    isBrowserOnlineMock.mockReturnValue(true);
    authMock.currentUser = null;
    onAuthStateChangedMock.mockReset();
    removeMutationMock.mockResolvedValue(undefined);
    applyPendingMutationMock.mockResolvedValue(undefined);
  });

  it('flushes pending mutations when auth becomes ready after boot', async () => {
    const pending = new Set(['first']);
    const addEventListenerMock = vi.fn();

    vi.stubGlobal('window', { addEventListener: addEventListenerMock });

    getPendingMutationsMock.mockImplementation(async () => Array.from(pending).map(mutation));
    removeMutationMock.mockImplementation(async (id: string) => {
      pending.delete(id);
    });

    let authCallback: ((user: { uid: string } | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      authCallback = callback as (user: { uid: string } | null) => void;
      return vi.fn();
    });

    const { startSyncEngine } = await import('@/lib/localDb/syncEngine');
    startSyncEngine();

    expect(onAuthStateChangedMock).toHaveBeenCalled();
    expect(applyPendingMutationMock).not.toHaveBeenCalled();

    authMock.currentUser = { uid: 'user-1' };
    authCallback?.({ uid: 'user-1' });

    await vi.waitFor(() => {
      expect(applyPendingMutationMock).toHaveBeenCalledTimes(1);
    });

    vi.unstubAllGlobals();
  });
});
