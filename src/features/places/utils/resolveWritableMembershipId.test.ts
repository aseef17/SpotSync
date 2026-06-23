import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getDocMock,
  writeBatchMock,
  batchSetMock,
  batchDeleteMock,
  batchCommitMock,
  updateDocMock,
} = vi.hoisted(() => {
  const batchSetMock = vi.fn();
  const batchDeleteMock = vi.fn();
  const batchCommitMock = vi.fn().mockResolvedValue(undefined);
  const writeBatchMock = vi.fn(() => ({
    set: batchSetMock,
    delete: batchDeleteMock,
    update: vi.fn(),
    commit: batchCommitMock,
  }));

  return {
    getDocMock: vi.fn(),
    writeBatchMock,
    batchSetMock,
    batchDeleteMock,
    batchCommitMock,
    updateDocMock: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('firebase/firestore', () => ({
  arrayRemove: vi.fn((...values: unknown[]) => ({ op: 'arrayRemove', values })),
  arrayUnion: vi.fn((...values: unknown[]) => ({ op: 'arrayUnion', values })),
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
  getDoc: getDocMock,
  updateDoc: updateDocMock,
  writeBatch: writeBatchMock,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('@/features/places/api/googlePlaceFirestore', () => ({
  googlePlaceDocRef: vi.fn((id: string) => ({ collection: 'googlePlaces', id })),
}));

vi.mock('@/features/places/api/listPlaceMembershipFirestore', () => ({
  listPlaceMembershipDocRef: vi.fn((id: string) => ({ collection: 'listPlaces', id })),
}));

import { resolveWritableMembershipId } from '@/features/places/utils/resolveWritableMembershipId';

const LIST_ID = 'Gzzf9zOWcEkCxyJx2Mo8';
const CHIJ = 'ChIJwfbFiiNZwokRN8hnF940DbY';
const CHIJ_MEMBERSHIP = `${LIST_ID}_${CHIJ}`;

describe('resolveWritableMembershipId', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    writeBatchMock.mockClear();
    batchCommitMock.mockClear();
    updateDocMock.mockClear();
  });

  it('returns the requested id when the membership already exists', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => true });

    await expect(resolveWritableMembershipId(CHIJ_MEMBERSHIP)).resolves.toBe(CHIJ_MEMBERSHIP);
    expect(writeBatchMock).not.toHaveBeenCalled();
  });

  it('migrates legacy manual_passport membership to canonical ChIJ id', async () => {
    getDocMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ name: 'MoMA PS1' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ listId: LIST_ID, status: 'not_visited' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ listId: LIST_ID, status: 'not_visited' }),
      })
      .mockResolvedValueOnce({ exists: () => false });

    const resolved = await resolveWritableMembershipId(CHIJ_MEMBERSHIP);

    expect(resolved).toBe(CHIJ_MEMBERSHIP);
    expect(writeBatchMock).toHaveBeenCalledTimes(1);
    expect(batchSetMock).toHaveBeenCalled();
    expect(batchDeleteMock).toHaveBeenCalled();
    expect(batchCommitMock).toHaveBeenCalled();
    expect(updateDocMock).toHaveBeenCalled();
  });

  it('merges legacy membership fields when canonical already exists', async () => {
    getDocMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ name: 'MoMA PS1' }),
      })
      .mockResolvedValueOnce({ exists: () => true })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ listId: LIST_ID, status: 'visited', notes: 'legacy notes' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ listId: LIST_ID, status: 'not_visited' }),
      });

    await expect(resolveWritableMembershipId(CHIJ_MEMBERSHIP)).resolves.toBe(CHIJ_MEMBERSHIP);

    expect(batchSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'visited',
        notes: 'legacy notes',
        googlePlaceId: CHIJ,
      }),
      { merge: true }
    );
    expect(batchDeleteMock).toHaveBeenCalled();
  });

  it('throws when legacy membership disappears before migration completes', async () => {
    getDocMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ name: 'MoMA PS1' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ listId: LIST_ID, status: 'not_visited' }),
      })
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => false });

    await expect(resolveWritableMembershipId(CHIJ_MEMBERSHIP)).rejects.toThrow(
      'Legacy membership'
    );
  });
});
