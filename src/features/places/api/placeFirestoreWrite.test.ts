import { beforeEach, describe, expect, it, vi } from 'vitest';

const batchUpdateMock = vi.fn();
const batchDeleteMock = vi.fn();
const batchCommitMock = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn(() => ({ path: 'mock-doc' })),
    writeBatch: vi.fn(() => ({
      update: batchUpdateMock,
      delete: batchDeleteMock,
      commit: batchCommitMock,
    })),
  };
});

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('@/features/places/api/listPlaceMembershipFirestore', () => ({
  listPlaceMembershipDocRef: vi.fn((membershipId: string) => ({
    path: `listPlaces/${membershipId}`,
  })),
}));

import { deletePlaceMembership } from '@/features/places/api/placeFirestoreWrite';
import { writeBatch } from 'firebase/firestore';

describe('deletePlaceMembership', () => {
  beforeEach(() => {
    batchUpdateMock.mockClear();
    batchDeleteMock.mockClear();
    batchCommitMock.mockClear();
    vi.mocked(writeBatch).mockClear();
  });

  it('removes list linkage and membership in a single batch commit', async () => {
    await deletePlaceMembership('list1_ChIJabc', 'list1');

    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
    expect(batchDeleteMock).toHaveBeenCalledTimes(1);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });
});
