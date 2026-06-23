import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getDocMock,
  writeBatchMock,
  batchSetMock,
  batchDeleteMock,
  batchCommitMock,
  updateDocMock,
  fetchListAccessFieldsForWriteMock,
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
    fetchListAccessFieldsForWriteMock: vi.fn().mockResolvedValue({
      listOwnerId: 'owner-1',
      listIsPublic: false,
      listCollaboratorIds: ['owner-1'],
    }),
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

vi.mock('@/features/places/utils/fetchListAccessFieldsForWrite', () => ({
  fetchListAccessFieldsForWrite: fetchListAccessFieldsForWriteMock,
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
    fetchListAccessFieldsForWriteMock.mockClear();
    fetchListAccessFieldsForWriteMock.mockResolvedValue({
      listOwnerId: 'owner-1',
      listIsPublic: false,
      listCollaboratorIds: ['owner-1'],
    });
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

  it('preserves canonical list access fields when merging legacy membership data', async () => {
    getDocMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ name: 'MoMA PS1' }),
      })
      .mockResolvedValueOnce({ exists: () => true })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          listId: LIST_ID,
          status: 'visited',
          notes: 'legacy notes',
          listOwnerId: 'owner-1',
          listIsPublic: true,
          listCollaboratorIds: ['owner-1', 'revoked-user'],
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          listId: LIST_ID,
          status: 'not_visited',
          listOwnerId: 'owner-1',
          listIsPublic: false,
          listCollaboratorIds: ['owner-1'],
        }),
      });

    await expect(resolveWritableMembershipId(CHIJ_MEMBERSHIP)).resolves.toBe(CHIJ_MEMBERSHIP);

    expect(batchSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'visited',
        notes: 'legacy notes',
        listIsPublic: false,
        listCollaboratorIds: ['owner-1'],
        googlePlaceId: CHIJ,
      }),
      { merge: true }
    );
  });

  it('uses current list access fields when creating canonical from legacy membership', async () => {
    getDocMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ name: 'MoMA PS1' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          listId: LIST_ID,
          status: 'visited',
          notes: 'legacy notes',
          listOwnerId: 'owner-1',
          listIsPublic: true,
          listCollaboratorIds: ['owner-1', 'revoked-user'],
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          listId: LIST_ID,
          status: 'visited',
          notes: 'legacy notes',
          listOwnerId: 'owner-1',
          listIsPublic: true,
          listCollaboratorIds: ['owner-1', 'revoked-user'],
        }),
      })
      .mockResolvedValueOnce({ exists: () => false });

    await expect(resolveWritableMembershipId(CHIJ_MEMBERSHIP)).resolves.toBe(CHIJ_MEMBERSHIP);

    expect(fetchListAccessFieldsForWriteMock).toHaveBeenCalledWith(LIST_ID);
    expect(batchSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'visited',
        notes: 'legacy notes',
        listIsPublic: false,
        listCollaboratorIds: ['owner-1'],
        googlePlaceId: CHIJ,
      })
    );
  });

  it('returns canonical id when legacy membership disappears before migration completes', async () => {
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

    await expect(resolveWritableMembershipId(CHIJ_MEMBERSHIP)).resolves.toBe(CHIJ_MEMBERSHIP);
    expect(writeBatchMock).not.toHaveBeenCalled();
  });
});
