import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceList } from '@/features/lists/types/list';

const getCachedListMock = vi.fn();
const getPendingMutationsMock = vi.fn();
const acquireListSyncMock = vi.fn();
let listChangeHandler: (() => void) | undefined;

vi.mock('@/lib/localDb', () => ({
  applyPendingMutationsToLists: (lists: PlaceList[]) => lists,
  getCachedList: (...args: unknown[]) => getCachedListMock(...args),
  getCachedUserLists: vi.fn(),
  getPendingMutations: (...args: unknown[]) => getPendingMutationsMock(...args),
}));

vi.mock('@/lib/localDb/listCache', () => ({
  getCachedList: (...args: unknown[]) => getCachedListMock(...args),
}));

vi.mock('@/lib/localDb/sync/listSync', () => ({
  acquireListSync: (...args: unknown[]) => acquireListSyncMock(...args),
  acquireUserOwnedListsSync: vi.fn(() => () => {}),
  clearUserListsSyncState: vi.fn(),
}));

vi.mock('@/lib/localDb/sync/userProfileSync', () => ({
  acquireUserProfileSync: vi.fn(() => () => {}),
  clearUserSavedListIdsDedupForUser: vi.fn(),
}));

vi.mock('@/lib/localDb/changeBus', () => ({
  changeTopics: {
    list: (listId: string) => `list:${listId}`,
    userLists: (userId: string) => `userLists:${userId}`,
  },
  subscribeToChanges: vi.fn((_topic: string, handler: () => void) => {
    listChangeHandler = handler;
    return vi.fn();
  }),
}));

vi.mock('@/lib/localDb/sync/listPublishMeta', () => ({
  consumeListPublishFromCache: vi.fn(() => true),
}));

import { listRepository } from '@/lib/localDb/repositories/listRepository';

const staleList: PlaceList = {
  id: 'list-1',
  name: 'Stale List',
  ownerId: 'owner-1',
  isPublic: false,
  collaboratorIds: ['owner-1'],
  collaborators: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe('listRepository.subscribeToList', () => {
  beforeEach(() => {
    getCachedListMock.mockReset();
    getPendingMutationsMock.mockReset();
    acquireListSyncMock.mockReset();
    listChangeHandler = undefined;
    getPendingMutationsMock.mockResolvedValue([]);
    acquireListSyncMock.mockReturnValue(() => {});
  });

  it('drops stale publish results when a newer publish starts before the read completes', async () => {
    let resolveStaleRead: (value: PlaceList | null) => void;
    const staleRead = new Promise<PlaceList | null>((resolve) => {
      resolveStaleRead = resolve;
    });
    let readCount = 0;

    getCachedListMock.mockImplementation(async () => {
      readCount += 1;
      if (readCount === 1) {
        return staleRead;
      }
      return null;
    });

    const updates: Array<{ list: PlaceList | null; fromCache: boolean }> = [];
    listRepository.subscribeToList(
      'list-1',
      (list, meta) => {
        updates.push({ list, fromCache: meta.fromCache });
      },
      () => {
        throw new Error('unexpected publish error');
      }
    );

    expect(readCount).toBe(1);

    listChangeHandler?.();
    await Promise.resolve();
    expect(readCount).toBe(2);

    resolveStaleRead!(staleList);
    await Promise.resolve();
    await Promise.resolve();

    expect(updates).toEqual([{ list: null, fromCache: true }]);
  });
});
