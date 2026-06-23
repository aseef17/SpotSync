import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isBrowserOnlineMock, flushPendingMutationsMock, toastMock } = vi.hoisted(() => ({
  isBrowserOnlineMock: vi.fn(() => true),
  flushPendingMutationsMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: isBrowserOnlineMock,
}));

vi.mock('@/lib/localDb', () => ({
  flushPendingMutations: flushPendingMutationsMock,
}));

vi.mock('@/lib/localDb/syncMutationRecovery', () => ({
  formatSyncFailureDetail: (
    result: { syncedCount: number; remainingCount: number; lastError?: unknown },
    getErrorMessage: (error: unknown) => string
  ) =>
    result.syncedCount > 0
      ? `${result.syncedCount} synced, ${result.remainingCount} still waiting.`
      : getErrorMessage(result.lastError),
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('@/lib/localDb/localDataStore', () => ({
  initLocalDataStore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/syncDebug', () => ({
  syncDebug: vi.fn(),
}));

describe('retryPendingSync', () => {
  beforeEach(() => {
    vi.resetModules();
    isBrowserOnlineMock.mockReset();
    flushPendingMutationsMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.message.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost' },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
  });

  it('probes and flushes when navigator stays offline but fetch succeeds', async () => {
    isBrowserOnlineMock.mockReturnValue(false);
    flushPendingMutationsMock.mockResolvedValue({ syncedCount: 2, remainingCount: 0 });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const { retryPendingSync } = await import('@/utils/retryConnection');
    const attempt = await retryPendingSync();

    expect(fetch).toHaveBeenCalled();
    expect(flushPendingMutationsMock).toHaveBeenCalledWith({
      ignoreBrowserOffline: true,
      force: true,
    });
    expect(toastMock.success).toHaveBeenCalledWith('All changes synced');
    expect(attempt.ok).toBe(true);
  });

  it('skips connectivity probe and flushes immediately when already online', async () => {
    isBrowserOnlineMock.mockReturnValue(true);
    flushPendingMutationsMock.mockResolvedValue({ syncedCount: 1, remainingCount: 0 });

    const { retryPendingSync } = await import('@/utils/retryConnection');
    const attempt = await retryPendingSync();

    expect(fetch).not.toHaveBeenCalled();
    expect(flushPendingMutationsMock).toHaveBeenCalledWith({
      ignoreBrowserOffline: false,
      force: true,
    });
    expect(attempt.ok).toBe(true);
  });

  it('does not flush when navigator and probe both report offline', async () => {
    isBrowserOnlineMock.mockReturnValue(false);
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const { retryPendingSync } = await import('@/utils/retryConnection');
    const attempt = await retryPendingSync();

    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(toastMock.message).toHaveBeenCalledWith(
      'Still offline',
      expect.objectContaining({
        description: expect.stringContaining('Cached data is still available'),
      })
    );
    expect(attempt.ok).toBe(false);
    expect(attempt.offline).toBe(true);
  });

  it('reports failure when flush settles with an infrastructure error and empty counts', async () => {
    isBrowserOnlineMock.mockReturnValue(true);
    flushPendingMutationsMock.mockResolvedValue({
      syncedCount: 0,
      remainingCount: 0,
      lastError: new Error('db read failed'),
    });

    const { retryPendingSync } = await import('@/utils/retryConnection');
    const attempt = await retryPendingSync();

    expect(attempt.ok).toBe(false);
    expect(attempt.message).toContain('db read failed');
    expect(toastMock.error).toHaveBeenCalledWith(
      'Sync failed',
      expect.objectContaining({ description: expect.stringContaining('db read failed') })
    );
  });
});
