import { beforeEach, describe, expect, it, vi } from 'vitest';

const batchDeleteMock = vi.fn();
const batchCommitMock = vi.fn().mockResolvedValue(undefined);
const deleteDocMock = vi.fn().mockResolvedValue(undefined);
const getDocsMock = vi.fn();

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(() => ({})),
    doc: vi.fn((...args: unknown[]) => ({ path: args.join('/') })),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    getDocs: (...args: unknown[]) => getDocsMock(...args),
    deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
    writeBatch: vi.fn(() => ({
      delete: batchDeleteMock,
      commit: batchCommitMock,
    })),
  };
});

vi.mock('@/lib/firebase', () => ({
  db: {},
  functions: {},
}));

vi.mock('@/features/places/api/placeFirestoreWrite', () => ({
  deletePlaceMembership: vi.fn(),
  writePlaceCreateAndLinkToList: vi.fn(),
  writePlaceUpdates: vi.fn(),
}));

import { applyPendingMutation } from '@/lib/localDb/syncHandlers';
import { writeBatch } from 'firebase/firestore';

function membershipDoc(id: string) {
  return { ref: { path: `listPlaces/${id}` } };
}

describe('applyDeleteList', () => {
  beforeEach(() => {
    batchDeleteMock.mockClear();
    batchCommitMock.mockClear();
    deleteDocMock.mockClear();
    getDocsMock.mockReset();
    vi.mocked(writeBatch).mockClear();
  });

  it('deletes the list doc in a single batch when there are no memberships', async () => {
    getDocsMock.mockResolvedValue({ docs: [] });

    await applyPendingMutation({
      id: 'delete-list-empty',
      type: 'deleteList',
      entityId: 'list-empty',
      payload: { listId: 'list-empty' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(batchDeleteMock).toHaveBeenCalledTimes(1);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('chunks membership deletes when a list has more than 499 places', async () => {
    const memberships = Array.from({ length: 600 }, (_, index) =>
      membershipDoc(`list-big_place-${index}`)
    );
    getDocsMock
      .mockResolvedValueOnce({ docs: memberships })
      .mockResolvedValueOnce({ docs: memberships.slice(499) });

    await applyPendingMutation({
      id: 'delete-list-big',
      type: 'deleteList',
      entityId: 'list-big',
      payload: { listId: 'list-big' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(getDocsMock).toHaveBeenCalledTimes(2);
    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(batchDeleteMock).toHaveBeenCalledTimes(601);
    expect(batchCommitMock).toHaveBeenCalledTimes(2);
  });

  it('re-queries memberships so places added mid-delete are still removed', async () => {
    const initialMemberships = Array.from({ length: 600 }, (_, index) =>
      membershipDoc(`list-big_place-${index}`)
    );
    const membershipsAfterConcurrentAdd = [
      ...initialMemberships.slice(499),
      membershipDoc('list-big_place-concurrent'),
    ];

    getDocsMock
      .mockResolvedValueOnce({ docs: initialMemberships })
      .mockResolvedValueOnce({ docs: membershipsAfterConcurrentAdd });

    await applyPendingMutation({
      id: 'delete-list-race',
      type: 'deleteList',
      entityId: 'list-big',
      payload: { listId: 'list-big' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(getDocsMock).toHaveBeenCalledTimes(2);
    expect(batchDeleteMock).toHaveBeenCalledTimes(602);
    expect(batchCommitMock).toHaveBeenCalledTimes(2);
  });
});
