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
    const ok = await retryPendingSync();

    expect(fetch).toHaveBeenCalled();
    expect(flushPendingMutationsMock).toHaveBeenCalledWith({ ignoreBrowserOffline: true });
    expect(toastMock.success).toHaveBeenCalledWith('All changes synced');
    expect(ok).toBe(true);
  });

  it('does not flush when navigator and probe both report offline', async () => {
    isBrowserOnlineMock.mockReturnValue(false);
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    const { retryPendingSync } = await import('@/utils/retryConnection');
    const ok = await retryPendingSync();

    expect(flushPendingMutationsMock).not.toHaveBeenCalled();
    expect(toastMock.message).toHaveBeenCalledWith(
      'Still offline',
      expect.objectContaining({
        description: expect.stringContaining('Cached data is still available'),
      })
    );
    expect(ok).toBe(false);
  });
});
