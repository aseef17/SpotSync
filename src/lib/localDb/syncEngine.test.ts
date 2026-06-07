import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getPendingMutationsMock,
  removeMutationMock,
  applyPendingMutationMock,
  isBrowserOnlineMock,
} = vi.hoisted(() => ({
  getPendingMutationsMock: vi.fn(),
  removeMutationMock: vi.fn(),
  applyPendingMutationMock: vi.fn(),
  isBrowserOnlineMock: vi.fn(() => true),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: isBrowserOnlineMock,
}));

vi.mock('@/lib/localDb/mutationQueue', () => ({
  getPendingMutations: getPendingMutationsMock,
  removeMutation: removeMutationMock,
}));

vi.mock('@/lib/localDb/syncHandlers', () => ({
  applyPendingMutation: applyPendingMutationMock,
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

    await Promise.all([flushPendingMutations(), flushPendingMutations()]);

    expect(applyPendingMutationMock).toHaveBeenCalledTimes(2);
    expect(removeMutationMock).toHaveBeenCalledWith('first');
    expect(removeMutationMock).toHaveBeenCalledWith('second');
  });

  it('does not flush when offline', async () => {
    isBrowserOnlineMock.mockReturnValue(false);
    getPendingMutationsMock.mockResolvedValue([mutation('first')]);

    const { flushPendingMutations } = await import('@/lib/localDb/syncEngine');
    await flushPendingMutations();

    expect(applyPendingMutationMock).not.toHaveBeenCalled();
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
    await flushPendingMutations();

    expect(removeMutationMock).toHaveBeenCalledWith('ok');
    expect(removeMutationMock).not.toHaveBeenCalledWith('fail');
    expect(applyPendingMutationMock).toHaveBeenCalledTimes(2);
  });
});
