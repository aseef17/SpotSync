import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'sql.js';
import type { PlaceList } from '@/features/lists/types/list';

const { mockDb, upsertCachedListMock } = vi.hoisted(() => ({
  mockDb: {
    prepare: vi.fn(),
    run: vi.fn(),
  },
  upsertCachedListMock: vi.fn(),
}));

vi.mock('@/lib/localDb/database', () => ({
  getLocalDatabase: vi.fn(),
  runWriteAsync: vi.fn(async (callback: (db: Database) => void) =>
    callback(mockDb as unknown as Database)
  ),
}));

vi.mock('@/lib/localDb/listCache', () => ({
  upsertCachedList: upsertCachedListMock,
}));

import { upsertCachedUserLists } from '@/lib/localDb/userListsCache';

const list = (id: string, updatedAt = new Date('2024-01-02T12:00:00Z')): PlaceList =>
  ({
    id,
    name: id,
    updatedAt,
  }) as PlaceList;

describe('upsertCachedUserLists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCachedListMock.mockResolvedValue(undefined);

    mockDb.prepare.mockImplementation(() => ({
      bind: vi.fn(),
      step: vi.fn().mockReturnValue(false),
      free: vi.fn(),
    }));
  });

  it('removes user_lists rows that are no longer in the published snapshot', async () => {
    mockDb.prepare.mockImplementation(() => ({
      bind: vi.fn(),
      step: vi
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false),
      getAsObject: vi.fn().mockReturnValue({
        data: JSON.stringify(list('removed')),
      }),
      free: vi.fn(),
    }));

    await upsertCachedUserLists('user-1', [list('kept')]);

    expect(mockDb.run).toHaveBeenCalledWith(
      'DELETE FROM user_lists WHERE user_id = ? AND list_id = ?',
      ['user-1', 'removed']
    );
    expect(upsertCachedListMock).toHaveBeenCalledWith(list('kept'));
  });

  it('prunes all cached user lists when the published snapshot is empty', async () => {
    mockDb.prepare.mockImplementation(() => ({
      bind: vi.fn(),
      step: vi
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false),
      getAsObject: vi.fn().mockReturnValue({
        data: JSON.stringify(list('stale')),
      }),
      free: vi.fn(),
    }));

    await upsertCachedUserLists('user-1', []);

    expect(mockDb.run).toHaveBeenCalledWith(
      'DELETE FROM user_lists WHERE user_id = ? AND list_id = ?',
      ['user-1', 'stale']
    );
    expect(upsertCachedListMock).not.toHaveBeenCalled();
  });

  it('delegates list cache writes to upsertCachedList for freshness checks', async () => {
    const kept = list('kept');
    await upsertCachedUserLists('user-1', [kept]);

    expect(upsertCachedListMock).toHaveBeenCalledWith(kept);
    expect(mockDb.run).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO lists'),
      expect.anything()
    );
  });
});
