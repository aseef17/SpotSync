import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { enqueueSnapshotTask } from '@/lib/localDb/snapshotQueue';

describe('enqueueSnapshotTask', () => {
  it('runs snapshot handlers in order even when an earlier handler is slower', async () => {
    const chains = new Map<string, Promise<void>>();
    const order: string[] = [];

    enqueueSnapshotTask(chains, 'user-1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('first');
    });

    enqueueSnapshotTask(chains, 'user-1', async () => {
      order.push('second');
    });

    await chains.get('user-1');

    expect(order).toEqual(['first', 'second']);
  });

  it('logs and continues when a handler fails', async () => {
    const chains = new Map<string, Promise<void>>();
    const order: string[] = [];

    enqueueSnapshotTask(chains, 'user-1', async () => {
      throw new Error('snapshot failed');
    });

    enqueueSnapshotTask(chains, 'user-1', async () => {
      order.push('after-failure');
    });

    await chains.get('user-1');

    expect(order).toEqual(['after-failure']);
  });
});
