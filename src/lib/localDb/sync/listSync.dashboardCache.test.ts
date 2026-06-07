import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceList } from '@/features/lists/types/list';

const syncCachedUserListsMock = vi.fn();
const upsertCachedUserListsMock = vi.fn();
const getCachedUserListsMock = vi.fn();
const fetchSavedListsByIdsMock = vi.fn();

let ownedListsSnapshotHandler: ((snapshot: unknown) => void) | undefined;
let ownedListsSyncCreateCount = 0;
let ownedListsSyncEntryExists = false;
let releaseOwnedListsSync: (() => void) | undefined;

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(() => ({
      withConverter: vi.fn(() => ({})),
    })),
    doc: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    or: vi.fn(() => ({})),
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    onSnapshot: vi.fn((_query, handler: (snapshot: unknown) => void) => {
      ownedListsSnapshotHandler = handler;
      return vi.fn();
    }),
  };
});

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('@/lib/localDb/subscriptionRegistry', () => ({
  acquireSubscription: vi.fn((_key: string, create: () => () => void) => {
    if (!ownedListsSyncEntryExists) {
      create();
      ownedListsSyncEntryExists = true;
      ownedListsSyncCreateCount += 1;
    }

    const release = () => {
      // Subscription registry keeps the entry alive during its grace window.
    };
    releaseOwnedListsSync = release;
    return release;
  }),
}));

vi.mock('@/lib/localDb/userListsCache', () => ({
  getCachedUserLists: (...args: unknown[]) => getCachedUserListsMock(...args),
  syncCachedUserLists: (...args: unknown[]) => syncCachedUserListsMock(...args),
  upsertCachedUserLists: (...args: unknown[]) => upsertCachedUserListsMock(...args),
  writeUserListsForDashboard: async (userId: string, lists: unknown, pruneOrphans: boolean) => {
    if (pruneOrphans) {
      return syncCachedUserListsMock(userId, lists);
    }
    return upsertCachedUserListsMock(userId, lists);
  },
  removeCachedUserList: vi.fn(),
}));

vi.mock('@/lib/localDb/listCache', () => ({
  upsertCachedList: vi.fn(),
  removeCachedList: vi.fn(),
}));

vi.mock('@/lib/localDb/changeBus', () => ({
  changeTopics: {
    userLists: vi.fn((userId: string) => `userLists:${userId}`),
    list: vi.fn((id: string) => `list:${id}`),
  },
  emitChange: vi.fn(),
}));

vi.mock('@/features/lists/api/savedListsFetch', () => ({
  fetchSavedListsByIds: (...args: unknown[]) => fetchSavedListsByIdsMock(...args),
  hasRemovedSavedListIds: vi.fn(() => false),
  shouldCommitSavedListFetch: vi.fn(() => true),
}));

vi.mock('@/features/lists/api/listFirestore', () => ({
  listConverter: {},
}));

vi.mock('@/lib/localDb/userCache', () => ({
  getCachedUser: vi.fn(),
}));

import { getCachedUser } from '@/lib/localDb/userCache';
import {
  acquireUserOwnedListsSync,
  clearUserListsSyncState,
  setUserSavedListIds,
} from '@/lib/localDb/sync/listSync';

const getCachedUserMock = vi.mocked(getCachedUser);

const ownedList = {
  id: 'owned-1',
  name: 'Owned list',
  ownerId: 'user-1',
  isPublic: false,
  collaborators: [],
  collaboratorIds: ['user-1'],
  editorIds: ['user-1'],
  places: [],
  customStatuses: [],
  tags: [],
  icon: 'AUTO',
  color: 'Blue',
  iconSize: 36,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  createdBy: 'user-1',
  updatedBy: 'user-1',
} as PlaceList;

function makeOwnedListsSnapshot() {
  return {
    docs: [{ data: () => ownedList }],
    docChanges: () => [],
  };
}

describe('dashboard cache publish gating', () => {
  beforeEach(() => {
    syncCachedUserListsMock.mockReset();
    upsertCachedUserListsMock.mockReset();
    getCachedUserListsMock.mockReset();
    getCachedUserListsMock.mockResolvedValue(null);
    fetchSavedListsByIdsMock.mockReset();
    getCachedUserMock.mockReset();
    ownedListsSnapshotHandler = undefined;
    ownedListsSyncCreateCount = 0;
    ownedListsSyncEntryExists = false;
    releaseOwnedListsSync = undefined;
    clearUserListsSyncState('user-1');
  });

  it('upserts owned lists before profile saved-list state is ready', async () => {
    acquireUserOwnedListsSync('user-1');
    ownedListsSnapshotHandler?.(makeOwnedListsSnapshot());

    await Promise.resolve();
    await Promise.resolve();

    expect(upsertCachedUserListsMock).toHaveBeenCalledWith('user-1', [ownedList]);
    expect(syncCachedUserListsMock).not.toHaveBeenCalled();
  });

  it('reseeds saved-list ids from profile cache when sync state is cleared and reacquired', async () => {
    fetchSavedListsByIdsMock.mockResolvedValue({ lists: [], resolved: true });
    getCachedUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'User',
      username: 'user',
      savedLists: ['saved-1'],
      fcmTokens: [],
      notificationsDisabled: false,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });

    acquireUserOwnedListsSync('user-1');
    expect(ownedListsSyncCreateCount).toBe(1);
    await Promise.resolve();
    await Promise.resolve();

    releaseOwnedListsSync?.();
    clearUserListsSyncState('user-1');
    fetchSavedListsByIdsMock.mockClear();
    getCachedUserMock.mockClear();

    acquireUserOwnedListsSync('user-1');
    expect(ownedListsSyncCreateCount).toBe(1);

    await Promise.resolve();
    await Promise.resolve();

    expect(getCachedUserMock).toHaveBeenCalledWith('user-1');
    expect(fetchSavedListsByIdsMock).toHaveBeenCalledWith(['saved-1'], {});
  });

  it('replays profile saved-list ids that arrived before owned-list sync started', async () => {
    fetchSavedListsByIdsMock.mockResolvedValue({ lists: [], resolved: true });

    setUserSavedListIds('user-1', ['saved-1']);
    expect(fetchSavedListsByIdsMock).not.toHaveBeenCalled();

    acquireUserOwnedListsSync('user-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSavedListsByIdsMock).toHaveBeenCalledWith(['saved-1'], {});
  });

  it('replaces dashboard rows once profile saved-list state is ready', async () => {
    fetchSavedListsByIdsMock.mockResolvedValue({ lists: [], resolved: true });

    acquireUserOwnedListsSync('user-1');
    ownedListsSnapshotHandler?.(makeOwnedListsSnapshot());

    await Promise.resolve();
    await Promise.resolve();

    upsertCachedUserListsMock.mockClear();
    syncCachedUserListsMock.mockClear();

    setUserSavedListIds('user-1', []);
    await Promise.resolve();
    await Promise.resolve();

    expect(syncCachedUserListsMock).toHaveBeenCalledWith('user-1', [ownedList]);
    expect(upsertCachedUserListsMock).not.toHaveBeenCalled();
  });

  it('prunes saved-list removals after sync state reset within subscription grace', async () => {
    fetchSavedListsByIdsMock.mockResolvedValue({ lists: [], resolved: true });

    acquireUserOwnedListsSync('user-1');
    ownedListsSnapshotHandler?.(makeOwnedListsSnapshot());
    await Promise.resolve();
    await Promise.resolve();

    releaseOwnedListsSync?.();
    clearUserListsSyncState('user-1');
    syncCachedUserListsMock.mockClear();
    upsertCachedUserListsMock.mockClear();
    getCachedUserListsMock.mockResolvedValue([ownedList]);

    acquireUserOwnedListsSync('user-1');
    setUserSavedListIds('user-1', []);
    await Promise.resolve();
    await Promise.resolve();

    expect(syncCachedUserListsMock).toHaveBeenCalledWith('user-1', [ownedList]);
  });

  it('does not prune dashboard rows when profile hydrates before owned lists load', async () => {
    acquireUserOwnedListsSync('user-1');

    setUserSavedListIds('user-1', []);
    await Promise.resolve();
    await Promise.resolve();

    expect(syncCachedUserListsMock).not.toHaveBeenCalled();

    ownedListsSnapshotHandler?.(makeOwnedListsSnapshot());
    await Promise.resolve();
    await Promise.resolve();

    expect(syncCachedUserListsMock).toHaveBeenCalledWith('user-1', [ownedList]);
  });
});
