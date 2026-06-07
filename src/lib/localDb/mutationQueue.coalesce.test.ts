import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'sql.js';

const mockDb = {
  prepare: vi.fn(),
  run: vi.fn(),
};

vi.mock('@/lib/localDb/database', () => ({
  getLocalDatabase: vi.fn(),
  runWriteAsync: vi.fn(async (callback: (db: Database) => void) =>
    callback(mockDb as unknown as Database)
  ),
}));

import { enqueueMutation } from '@/lib/localDb/mutationQueue';

describe('enqueueMutation create/delete coalescing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops a delete when it cancels an unsynced create', async () => {
    const pendingCreate = {
      step: vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValueOnce(false),
      bind: vi.fn(),
      getAsObject: vi.fn().mockReturnValue({ created_at: 1, payload: '{}' }),
      free: vi.fn(),
    };

    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT 1')) {
        return {
          bind: vi.fn(),
          step: vi.fn().mockReturnValue(true),
          free: vi.fn(),
        };
      }

      return pendingCreate;
    });

    await enqueueMutation({
      type: 'deletePlace',
      entityId: 'place-new',
      payload: { placeId: 'place-new', listId: 'list-1' },
    });

    expect(mockDb.run).toHaveBeenCalledWith(
      'DELETE FROM pending_mutations WHERE entity_id = ? AND type IN (?, ?, ?, ?)',
      ['place-new', 'createPlace', 'updatePlace', 'updatePlaceStatus', 'deletePlace']
    );
    expect(mockDb.run).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pending_mutations'),
      expect.anything()
    );
  });

  it('drops orphan update mutations when delete cancels an unsynced create', async () => {
    mockDb.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT 1')) {
        return {
          bind: vi.fn(),
          step: vi.fn().mockReturnValue(true),
          free: vi.fn(),
        };
      }

      return {
        bind: vi.fn(),
        step: vi.fn().mockReturnValue(false),
        free: vi.fn(),
      };
    });

    await enqueueMutation({
      type: 'deletePlace',
      entityId: 'place-new',
      payload: { placeId: 'place-new', listId: 'list-1' },
    });

    expect(mockDb.run).toHaveBeenCalledWith(
      'DELETE FROM pending_mutations WHERE entity_id = ? AND type IN (?, ?, ?, ?)',
      ['place-new', 'createPlace', 'updatePlace', 'updatePlaceStatus', 'deletePlace']
    );
  });
});
