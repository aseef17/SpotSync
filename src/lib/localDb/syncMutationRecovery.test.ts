import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingMutation } from '@/lib/localDb/types';
import {
  formatSyncFailureDetail,
  shouldDropStaleMutation,
} from '@/lib/localDb/syncMutationRecovery';

const { getDocMock, authMock } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  authMock: { currentUser: { uid: 'user-1' } as { uid: string } | null },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
  getDoc: getDocMock,
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: authMock,
}));

vi.mock('@/features/places/api/listPlaceMembershipFirestore', () => ({
  listPlaceMembershipDocRef: vi.fn((membershipId: string) => ({
    collection: 'listPlaces',
    id: membershipId,
  })),
}));

function statusMutation(
  membershipId: string,
  status: 'visited' | 'not_visited' = 'visited'
): PendingMutation {
  return {
    id: `updatePlaceStatus:${membershipId}`,
    type: 'updatePlaceStatus',
    entityId: membershipId,
    payload: { placeId: membershipId, status },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('shouldDropStaleMutation', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    authMock.currentUser = { uid: 'user-1' };
  });

  it('drops updatePlaceStatus when the membership no longer exists', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => false });

    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(true);
  });

  it('drops updatePlaceStatus when the status already matches the server', async () => {
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ listId: 'list-1', status: 'visited' }),
    });

    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1', 'visited'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(true);
  });

  it('drops updatePlaceStatus when the user no longer has write access', async () => {
    getDocMock
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ listId: 'list-1', status: 'not_visited' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          ownerId: 'owner-1',
          editorIds: ['owner-1'],
          collaboratorIds: ['owner-1', 'user-1'],
        }),
      });

    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1', 'visited'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(true);
  });

  it('keeps updatePlaceStatus when the user can still write and the status differs', async () => {
    getDocMock
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ listId: 'list-1', status: 'not_visited' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          ownerId: 'user-1',
          editorIds: ['user-1'],
          collaboratorIds: ['user-1'],
        }),
      });

    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1', 'visited'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(false);
  });

  it('drops updatePlaceStatus on not-found errors', async () => {
    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1'), {
      code: 'not-found',
    });

    expect(shouldDrop).toBe(true);
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it('keeps updatePlaceStatus when auth is not ready yet', async () => {
    authMock.currentUser = null;

    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ listId: 'list-1', status: 'not_visited' }),
    });

    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1', 'visited'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(false);
    expect(getDocMock).not.toHaveBeenCalled();
  });
});

describe('formatSyncFailureDetail', () => {
  it('includes mutation type when sync fails without partial progress', () => {
    const detail = formatSyncFailureDetail(
      {
        syncedCount: 0,
        remainingCount: 2,
        lastError: new Error('Missing or insufficient permissions.'),
        lastFailedMutation: { id: 'createPlace:list-1_place-1', type: 'createPlace' },
      },
      (error) => (error instanceof Error ? error.message : 'Unknown error')
    );

    expect(detail).toContain('createPlace');
    expect(detail).toContain('Missing or insufficient permissions.');
  });

  it('reports partial progress when some mutations synced', () => {
    const detail = formatSyncFailureDetail(
      {
        syncedCount: 1,
        remainingCount: 1,
        lastError: new Error('permission-denied'),
      },
      (error) => (error instanceof Error ? error.message : 'Unknown error')
    );

    expect(detail).toBe('1 synced, 1 still waiting.');
  });
});
