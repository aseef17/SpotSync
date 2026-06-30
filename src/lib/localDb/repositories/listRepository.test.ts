import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceList } from '@/features/lists/types/list';

const getCachedListMock = vi.fn();
const getPendingMutationsMock = vi.fn();
const applyPendingMutationsToListsMock = vi.fn();
const acquireListSyncMock = vi.fn();
const subscribeToChangesMock = vi.fn();

vi.mock('@/lib/localDb', () => ({
  getCachedList: (...args: unknown[]) => getCachedListMock(...args),
  getPendingMutations: (...args: unknown[]) => getPendingMutationsMock(...args),
  applyPendingMutationsToLists: (...args: unknown[]) => applyPendingMutationsToListsMock(...args),
}));

vi.mock('@/lib/localDb/changeBus', () => ({
  changeTopics: {
    list: vi.fn((listId: string) => `list:${listId}`),
  },
  subscribeToChanges: (...args: unknown[]) => subscribeToChangesMock(...args),
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

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

import { listRepository } from '@/lib/localDb/repositories/listRepository';

async function flushAsyncWork(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

const list = (): PlaceList =>
  ({
    id: 'list-1',
    name: 'Private list',
    isPublic: false,
    ownerId: 'owner-a',
    collaborators: [],
    collaboratorIds: ['owner-a'],
    places: [],
    customStatuses: [],
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as PlaceList;

describe('listRepository.subscribeToList', () => {
  beforeEach(() => {
    getCachedListMock.mockReset();
    getPendingMutationsMock.mockReset();
    applyPendingMutationsToListsMock.mockReset();
    acquireListSyncMock.mockReset();
    subscribeToChangesMock.mockReset();

    getPendingMutationsMock.mockResolvedValue([]);
    applyPendingMutationsToListsMock.mockImplementation((lists: PlaceList[]) => lists);
    acquireListSyncMock.mockReturnValue(() => {});
  });

  it('marks initial and sync-triggered sqlite reads as fromCache', async () => {
    const cachedList = list();
    const updates: Array<{ fromCache: boolean; list: PlaceList | null }> = [];
    let changeHandler: (() => void) | undefined;

    getCachedListMock.mockResolvedValue(cachedList);
    subscribeToChangesMock.mockImplementation((_topic: string, handler: () => void) => {
      changeHandler = handler;
      return () => {};
    });

    listRepository.subscribeToList(
      'list-1',
      (nextList, meta) => {
        updates.push({ fromCache: meta.fromCache, list: nextList });
      },
      () => {}
    );

    await flushAsyncWork();

    expect(updates).toEqual([{ fromCache: true, list: cachedList }]);

    changeHandler?.();
    await flushAsyncWork();

    expect(updates).toEqual([
      { fromCache: true, list: cachedList },
      { fromCache: true, list: cachedList },
    ]);
  });
});
