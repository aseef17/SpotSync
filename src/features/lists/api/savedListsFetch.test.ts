import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocsMock, getDocsFromCacheMock } = vi.hoisted(() => ({
  getDocsMock: vi.fn(),
  getDocsFromCacheMock: vi.fn(),
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
    getDocsFromCache: getDocsFromCacheMock,
  };
});

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: vi.fn(() => true),
}));

import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import type { FirestoreDataConverter } from 'firebase/firestore';
import { fetchSavedListsByIds } from '@/features/lists/api/savedListsFetch';
import type { PlaceList } from '@/features/lists/types/list';

const listConverter = {
  toFirestore: (list: PlaceList) => list,
  fromFirestore: (snapshot: { data: () => PlaceList }) => snapshot.data(),
} as unknown as FirestoreDataConverter<PlaceList>;

describe('fetchSavedListsByIds', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    getDocsFromCacheMock.mockReset();
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

  it('falls back to cache instead of wiping saved lists when the network read fails', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    getDocsFromCacheMock.mockResolvedValue({
      forEach: (cb: (doc: { data: () => { id: string; name: string } }) => void) => {
        cb({ data: () => ({ id: 'saved-1', name: 'Cached saved list' }) });
      },
    });

    const result = await fetchSavedListsByIds(['saved-1'], listConverter);

    expect(result.resolved).toBe(true);
    expect(result.lists).toEqual([{ id: 'saved-1', name: 'Cached saved list', isSavedList: true }]);
  });

  it('keeps unresolved state when both network and cache reads fail', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'));
    getDocsFromCacheMock.mockRejectedValue(new Error('cache miss'));

    const result = await fetchSavedListsByIds(['saved-1'], listConverter);

    expect(result.resolved).toBe(false);
    expect(result.lists).toEqual([]);
  });

  it('reads from cache directly when offline', async () => {
    vi.mocked(isBrowserOnline).mockReturnValue(false);
    getDocsFromCacheMock.mockResolvedValue({
      forEach: (cb: (doc: { data: () => { id: string; name: string } }) => void) => {
        cb({ data: () => ({ id: 'saved-1', name: 'Offline cached list' }) });
      },
    });

    const result = await fetchSavedListsByIds(['saved-1'], listConverter);

    expect(getDocsMock).not.toHaveBeenCalled();
    expect(result.resolved).toBe(true);
    expect(result.lists[0]?.name).toBe('Offline cached list');
  });
});
