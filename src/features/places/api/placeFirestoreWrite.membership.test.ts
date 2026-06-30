import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  updateDocMock,
  setDocMock,
  safeGetMembershipDocMock,
  fetchListAccessFieldsForWriteMock,
  getCachedPlaceMock,
  resolveWritableMembershipIdMock,
} = vi.hoisted(() => ({
  updateDocMock: vi.fn().mockResolvedValue(undefined),
  setDocMock: vi.fn().mockResolvedValue(undefined),
  safeGetMembershipDocMock: vi.fn(),
  fetchListAccessFieldsForWriteMock: vi.fn(),
  getCachedPlaceMock: vi.fn(),
  resolveWritableMembershipIdMock: vi.fn((id: string) => Promise.resolve(id)),
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn(() => ({ path: 'mock-doc' })),
    updateDoc: updateDocMock,
    setDoc: setDocMock,
  };
});

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-1' } },
}));

vi.mock('@/features/places/api/listPlaceMembershipFirestore', () => ({
  listPlaceMembershipDocRef: vi.fn((membershipId: string) => ({
    id: membershipId,
    path: `listPlaces/${membershipId}`,
  })),
}));

vi.mock('@/features/places/api/googlePlaceFirestore', () => ({
  googlePlaceDocRef: vi.fn((googlePlaceId: string) => ({
    id: googlePlaceId,
    path: `googlePlaces/${googlePlaceId}`,
  })),
}));

vi.mock('@/features/places/utils/safeMembershipGetDoc', () => ({
  safeGetMembershipDoc: safeGetMembershipDocMock,
}));

vi.mock('@/features/places/utils/fetchListAccessFieldsForWrite', () => ({
  fetchListAccessFieldsForWrite: fetchListAccessFieldsForWriteMock,
}));

vi.mock('@/lib/localDb/placeCache', () => ({
  getCachedPlace: getCachedPlaceMock,
}));

vi.mock('@/features/places/utils/resolveWritableMembershipId', () => ({
  resolveWritableMembershipId: resolveWritableMembershipIdMock,
}));

import { writePlaceUpdates } from '@/features/places/api/placeFirestoreWrite';

describe('writePlaceUpdates membership writes', () => {
  const membershipId = 'list-1_ChIJabc';
  const accessFields = {
    listOwnerId: 'user-1',
    listIsPublic: false,
    listCollaboratorIds: ['user-1'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchListAccessFieldsForWriteMock.mockResolvedValue(accessFields);
    getCachedPlaceMock.mockResolvedValue({
      id: membershipId,
      listId: 'list-1',
      googlePlaceId: 'ChIJabc',
      status: 'visited',
      addedBy: 'user-1',
      addedAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      updatedBy: 'user-1',
      ...accessFields,
    });
  });

  it('updates when the membership doc already exists', async () => {
    safeGetMembershipDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({ listId: 'list-1', status: 'not_visited' }),
    });

    await writePlaceUpdates(membershipId, {
      status: 'visited',
      updatedAt: new Date(),
      updatedBy: 'user-1',
    });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('creates the membership doc when reads treat it as missing', async () => {
    safeGetMembershipDocMock.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });

    await writePlaceUpdates(membershipId, {
      status: 'visited',
      updatedAt: new Date(),
      updatedBy: 'user-1',
    });

    expect(updateDocMock).not.toHaveBeenCalled();
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(fetchListAccessFieldsForWriteMock).toHaveBeenCalledWith('list-1');
    expect(setDocMock.mock.calls[0]?.[1]).toMatchObject({
      id: membershipId,
      listId: 'list-1',
      googlePlaceId: 'ChIJabc',
      status: 'visited',
      listOwnerId: 'user-1',
    });
  });

  it('applies membership patch fields when creating a missing doc', async () => {
    safeGetMembershipDocMock.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });
    getCachedPlaceMock.mockResolvedValue({
      id: membershipId,
      listId: 'list-1',
      googlePlaceId: 'ChIJabc',
      status: 'not_visited',
      notes: 'stale cache note',
      addedBy: 'user-1',
      addedAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      updatedBy: 'user-1',
      ...accessFields,
    });

    await writePlaceUpdates(membershipId, {
      status: 'visited',
      notes: 'fresh note',
      updatedAt: new Date(),
      updatedBy: 'user-1',
    });

    expect(setDocMock.mock.calls[0]?.[1]).toMatchObject({
      status: 'visited',
      notes: 'fresh note',
    });
  });
});
