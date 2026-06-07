import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceList } from '@/features/lists/types/list';

const runs: Array<{ sql: string; params: unknown[] }> = [];
const listRows = new Map<string, string>();

function createMockDb() {
  let bindParams: unknown[] = [];

  return {
    run: (sql: string, params: unknown[] = []) => {
      runs.push({ sql, params });
      if (sql.includes('INSERT INTO lists')) {
        listRows.set(String(params[0]), String(params[1]));
      }
    },
    prepare: (sql: string) => ({
      bind: (params: unknown[]) => {
        bindParams = params;
      },
      step: () => {
        if (sql.includes('FROM lists WHERE id = ?')) {
          return listRows.has(String(bindParams[0]));
        }
        return false;
      },
      getAsObject: () => ({ data: listRows.get(String(bindParams[0])) }),
      free: () => {},
    }),
  };
}

vi.mock('@/lib/localDb/database', () => ({
  runWriteAsync: vi.fn(
    async (callback: (db: ReturnType<typeof createMockDb>) => void) => {
      callback(createMockDb());
    }
  ),
}));

import {
  removeCachedUserDashboardList,
  syncCachedUserLists,
  writeUserListsForDashboard,
} from '@/lib/localDb/userListsCache';

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
    listRows.clear();
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

describe('writeUserListsForDashboard', () => {
  beforeEach(() => {
    runs.length = 0;
    listRows.clear();
  });

  it('upserts without pruning before saved lists are hydrated', async () => {
    await writeUserListsForDashboard('user-1', [list], false);

    expect(runs.some((entry) => entry.sql.includes('DELETE FROM user_lists'))).toBe(false);
    expect(runs.some((entry) => entry.sql.includes('INSERT INTO user_lists'))).toBe(true);
  });

  it('prunes stale rows once saved lists are hydrated', async () => {
    await writeUserListsForDashboard('user-1', [list], true);

    expect(runs[0]?.sql).toContain('DELETE FROM user_lists WHERE user_id = ? AND list_id NOT IN');
  });

  it('skips overwriting a fresher shared list cache row during dashboard upsert', async () => {
    const staleList = {
      ...list,
      name: 'Stale dashboard copy',
      updatedAt: new Date('2024-01-01'),
    } as PlaceList;
    const freshList = {
      ...list,
      name: 'Fresh shared cache copy',
      updatedAt: new Date('2024-06-01'),
    } as PlaceList;

    await writeUserListsForDashboard('user-1', [freshList], false);

    runs.length = 0;
    await writeUserListsForDashboard('user-1', [staleList], false);

    expect(runs.some((entry) => entry.sql.includes('INSERT INTO user_lists'))).toBe(true);
    expect(runs.some((entry) => entry.sql.includes('INSERT INTO lists'))).toBe(false);
  });
});

describe('removeCachedUserDashboardList', () => {
  beforeEach(() => {
    runs.length = 0;
  });

  it('removes only the user dashboard row and leaves the shared list cache alone', async () => {
    await removeCachedUserDashboardList('user-1', 'list-1');

    expect(runs).toEqual([
      {
        sql: 'DELETE FROM user_lists WHERE user_id = ? AND list_id = ?',
        params: ['user-1', 'list-1'],
      },
    ]);
  });
});
