import { describe, expect, it } from 'vitest';
import { formatSyncFailureDetail } from '@/lib/localDb/syncMutationRecovery';

describe('formatSyncFailureDetail', () => {
  it('includes mutation type when sync fails without partial progress', () => {
    const detail = formatSyncFailureDetail(
      {
        syncedCount: 0,
        remainingCount: 2,
        lastError: new Error('Missing or insufficient permissions.'),
        lastFailedMutation: { id: 'createPlace:list-1_place-1', type: 'createPlace' },
      },
      (error) => (error instanceof Error ? error.message : 'Unknown error')
    );

    expect(detail).toContain('createPlace');
    expect(detail).toContain('Missing or insufficient permissions.');
  });

  it('reports partial progress when some mutations synced', () => {
    const detail = formatSyncFailureDetail(
      {
        syncedCount: 1,
        remainingCount: 1,
        lastError: new Error('permission-denied'),
      },
      (error) => (error instanceof Error ? error.message : 'Unknown error')
    );

    expect(detail).toBe('1 synced, 1 still waiting.');
  });
});
