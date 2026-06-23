import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingMutation } from '@/lib/localDb/types';
import {
  formatSyncFailureDetail,
  shouldDropStaleMutation,
} from '@/lib/localDb/syncMutationRecovery';

const { getDocMock, authMock, findLegacyMock } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  authMock: { currentUser: { uid: 'user-1' } as { uid: string } | null },
  findLegacyMock: vi.fn().mockResolvedValue(null),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
  getDoc: getDocMock,
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: authMock,
}));

vi.mock('@/features/places/utils/resolveWritableMembershipId', () => ({
  findLegacyPassportMembershipId: findLegacyMock,
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
    findLegacyMock.mockReset();
    findLegacyMock.mockResolvedValue(null);
    authMock.currentUser = { uid: 'user-1' };
  });

  it('drops updatePlaceStatus when the membership no longer exists', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => false }).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        ownerId: 'owner-1',
        editorIds: ['owner-1'],
        collaboratorIds: ['owner-1'],
      }),
    });

    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(true);
  });

  it('keeps updatePlaceStatus when a legacy manual_passport membership can be migrated', async () => {
    const listId = 'Gzzf9zOWcEkCxyJx2Mo8';
    const chij = 'ChIJwfbFiiNZwokRN8hnF940DbY';
    const membershipId = `${listId}_${chij}`;

    getDocMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          ownerId: 'user-1',
          editorIds: ['user-1'],
          collaboratorIds: ['user-1'],
        }),
      });
    findLegacyMock.mockResolvedValueOnce(`${listId}_manual_passport_0f6e093656b1354e`);

    const shouldDrop = await shouldDropStaleMutation(statusMutation(membershipId, 'visited'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(false);
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

  it('drops updatePlaceStatus when migration is blocked because the parent list was deleted', async () => {
    const listId = 'Gzzf9zOWcEkCxyJx2Mo8';
    const chij = 'ChIJwfbFiiNZwokRN8hnF940DbY';
    const membershipId = `${listId}_${chij}`;

    getDocMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => false });
    findLegacyMock.mockResolvedValueOnce(`${listId}_manual_passport_0f6e093656b1354e`);

    const shouldDrop = await shouldDropStaleMutation(statusMutation(membershipId, 'visited'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(true);
  });

  it('drops updatePlaceStatus when migration fails because the parent list was deleted', async () => {
    const listId = 'Gzzf9zOWcEkCxyJx2Mo8';
    const chij = 'ChIJwfbFiiNZwokRN8hnF940DbY';
    const membershipId = `${listId}_${chij}`;

    getDocMock
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ listId, status: 'not_visited' }),
      })
      .mockResolvedValueOnce({ exists: () => false });

    const shouldDrop = await shouldDropStaleMutation(statusMutation(membershipId, 'visited'), {
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

  it('keeps updatePlaceStatus when auth is unavailable during stale checks', async () => {
    authMock.currentUser = null;

    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1', 'visited'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(false);
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it('keeps updatePlaceStatus when list access cannot be verified', async () => {
    getDocMock
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ listId: 'list-1', status: 'not_visited' }),
      })
      .mockRejectedValueOnce({ code: 'permission-denied' });

    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1', 'visited'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(false);
  });

  it('drops updatePlaceStatus on not-found errors when no legacy membership exists', async () => {
    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1'), {
      code: 'not-found',
    });

    expect(shouldDrop).toBe(true);
  });

  it('keeps updatePlaceStatus on not-found when a legacy manual_passport membership can be migrated', async () => {
    const listId = 'Gzzf9zOWcEkCxyJx2Mo8';
    const chij = 'ChIJwfbFiiNZwokRN8hnF940DbY';
    const membershipId = `${listId}_${chij}`;

    findLegacyMock.mockResolvedValueOnce(`${listId}_manual_passport_0f6e093656b1354e`);
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        ownerId: 'user-1',
        editorIds: ['user-1'],
        collaboratorIds: ['user-1'],
      }),
    });

    const shouldDrop = await shouldDropStaleMutation(statusMutation(membershipId, 'visited'), {
      code: 'not-found',
    });

    expect(shouldDrop).toBe(false);
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it('drops updatePlaceStatus on not-found when migration is blocked by a deleted list', async () => {
    const listId = 'Gzzf9zOWcEkCxyJx2Mo8';
    const chij = 'ChIJwfbFiiNZwokRN8hnF940DbY';
    const membershipId = `${listId}_${chij}`;

    findLegacyMock.mockResolvedValueOnce(`${listId}_manual_passport_0f6e093656b1354e`);
    getDocMock.mockResolvedValueOnce({ exists: () => false });

    const shouldDrop = await shouldDropStaleMutation(statusMutation(membershipId, 'visited'), {
      code: 'not-found',
    });

    expect(shouldDrop).toBe(true);
  });

  it('keeps updatePlaceStatus when membership get returns permission-denied for a missing doc', async () => {
    getDocMock.mockRejectedValueOnce({ code: 'permission-denied' }).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        ownerId: 'user-1',
        editorIds: ['user-1'],
        collaboratorIds: ['user-1'],
      }),
    });

    const shouldDrop = await shouldDropStaleMutation(statusMutation('list-1_place-1'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(false);
  });

  it('keeps updatePlaceStatus when permission-denied masks a missing doc but legacy can migrate', async () => {
    const listId = 'Gzzf9zOWcEkCxyJx2Mo8';
    const chij = 'ChIJwfbFiiNZwokRN8hnF940DbY';
    const membershipId = `${listId}_${chij}`;

    getDocMock.mockRejectedValueOnce({ code: 'permission-denied' });
    findLegacyMock.mockResolvedValueOnce(`${listId}_manual_passport_0f6e093656b1354e`);

    const shouldDrop = await shouldDropStaleMutation(statusMutation(membershipId, 'visited'), {
      code: 'permission-denied',
    });

    expect(shouldDrop).toBe(false);
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
