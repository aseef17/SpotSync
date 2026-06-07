import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocsMock, getCachedListMock } = vi.hoisted(() => ({
  getDocsMock: vi.fn(),
  getCachedListMock: vi.fn(),
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(() => ({
      withConverter: vi.fn(() => 'lists-collection'),
    })),
    query: vi.fn((...args: unknown[]) => args),
    where: vi.fn((...args: unknown[]) => args),
    getDocs: getDocsMock,
  };
});

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: vi.fn(() => true),
}));

vi.mock('@/lib/localDb', () => ({
  getCachedList: getCachedListMock,
  upsertCachedList: vi.fn(),
}));

import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import type { FirestoreDataConverter } from 'firebase/firestore';
import {
  fetchSavedListsByIds,
  shouldCommitSavedListFetch,
} from '@/features/lists/api/savedListsFetch';
import type { PlaceList } from '@/features/lists/types/list';

const listConverter = {
  toFirestore: (list: PlaceList) => list,
  fromFirestore: (snapshot: { data: () => PlaceList }) => snapshot.data(),
} as unknown as FirestoreDataConverter<PlaceList>;

describe('fetchSavedListsByIds', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    getCachedListMock.mockReset();
    vi.mocked(isBrowserOnline).mockReturnValue(true);
  });

  it('returns resolved results from the network when online', async () => {
    getDocsMock.mockResolvedValue({
      forEach: (cb: (doc: { data: () => { id: string; name: string } }) => void) => {
        cb({ data: () => ({ id: 'saved-1', name: 'Saved list' }) });
      },
    });

    const result = await fetchSavedListsByIds(['saved-1'], listConverter);

    expect(result.resolved).toBe(true);
    expect(result.lists).toEqual([{ id: 'saved-1', name: 'Saved list', isSavedList: true }]);
  });

  it('falls back to local cache when the network read fails', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    getCachedListMock.mockResolvedValue({ id: 'saved-1', name: 'Cached saved list' });

    const result = await fetchSavedListsByIds(['saved-1'], listConverter);

    expect(result.resolved).toBe(true);
    expect(result.lists).toEqual([{ id: 'saved-1', name: 'Cached saved list', isSavedList: true }]);
  });

  it('keeps unresolved state when both network and local cache reads fail', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    getCachedListMock.mockResolvedValue(null);

    const result = await fetchSavedListsByIds(['saved-1'], listConverter);

    expect(result.resolved).toBe(false);
    expect(result.lists).toEqual([]);
  });

  it('reports unresolved when a later chunk fails after an earlier chunk succeeds', async () => {
    getDocsMock
      .mockResolvedValueOnce({
        forEach: (cb: (doc: { data: () => { id: string; name: string } }) => void) => {
          cb({ data: () => ({ id: 'saved-1', name: 'First chunk list' }) });
        },
      })
      .mockRejectedValueOnce(new Error('offline'));
    getCachedListMock.mockResolvedValue(null);

    const ids = Array.from({ length: 11 }, (_, index) => `saved-${index + 1}`);
    const result = await fetchSavedListsByIds(ids, listConverter);

    expect(result.resolved).toBe(false);
    expect(result.lists).toEqual([{ id: 'saved-1', name: 'First chunk list', isSavedList: true }]);
  });

  it('commits partial first-load results but not stale refresh regressions', () => {
    expect(shouldCommitSavedListFetch(false, 10, false)).toBe(true);
    expect(shouldCommitSavedListFetch(true, 10, false)).toBe(false);
    expect(shouldCommitSavedListFetch(false, 0, false)).toBe(false);
    expect(shouldCommitSavedListFetch(true, 12, true)).toBe(true);
  });

  it('reads from local cache directly when offline', async () => {
    vi.mocked(isBrowserOnline).mockReturnValue(false);
    getCachedListMock.mockResolvedValue({ id: 'saved-1', name: 'Offline cached list' });

    const result = await fetchSavedListsByIds(['saved-1'], listConverter);

    expect(getDocsMock).not.toHaveBeenCalled();
    expect(result.resolved).toBe(true);
    expect(result.lists[0]?.name).toBe('Offline cached list');
  });
});
