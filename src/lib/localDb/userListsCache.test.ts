import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceList } from '@/features/lists/types/list';

const runs: Array<{ sql: string; params: unknown[] }> = [];

vi.mock('@/lib/localDb/database', () => ({
  runWriteAsync: vi.fn(
    async (callback: (db: { run: (sql: string, params?: unknown[]) => void }) => void) => {
      callback({
        run: (sql: string, params: unknown[] = []) => {
          runs.push({ sql, params });
        },
      });
    }
  ),
}));

import { syncCachedUserLists } from '@/lib/localDb/userListsCache';

const list = {
  id: 'list-1',
  name: 'Saved list',
  ownerId: 'owner-1',
  isPublic: true,
  collaborators: [],
  collaboratorIds: ['owner-1'],
  editorIds: ['owner-1'],
  places: [],
  customStatuses: [],
  tags: [],
  icon: 'AUTO',
  color: 'Blue',
  iconSize: 36,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  createdBy: 'owner-1',
  updatedBy: 'owner-1',
} as PlaceList;

describe('syncCachedUserLists', () => {
  beforeEach(() => {
    runs.length = 0;
  });

  it('prunes dashboard rows that are no longer in the merged set', async () => {
    await syncCachedUserLists('user-1', [list]);

    expect(runs[0]?.sql).toContain('DELETE FROM user_lists WHERE user_id = ? AND list_id NOT IN');
    expect(runs[0]?.params).toEqual(['user-1', 'list-1']);
    expect(runs.some((entry) => entry.sql.includes('INSERT INTO user_lists'))).toBe(true);
  });

  it('clears all dashboard rows when the merged set is empty', async () => {
    await syncCachedUserLists('user-1', []);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.sql).toBe('DELETE FROM user_lists WHERE user_id = ?');
    expect(runs[0]?.params).toEqual(['user-1']);
  });
});
