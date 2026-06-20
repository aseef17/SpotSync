import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteListFnMock = vi.fn().mockResolvedValue({ data: { success: true } });

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => deleteListFnMock),
}));

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

describe('applyDeleteList', () => {
  beforeEach(() => {
    deleteListFnMock.mockClear();
    deleteListFnMock.mockResolvedValue({ data: { success: true } });
  });

  it('calls the deleteList cloud function with the list id', async () => {
    await applyPendingMutation({
      id: 'deleteList:list-empty',
      type: 'deleteList',
      entityId: 'list-empty',
      payload: { listId: 'list-empty' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(deleteListFnMock).toHaveBeenCalledTimes(1);
    expect(deleteListFnMock).toHaveBeenCalledWith({ listId: 'list-empty' });
  });

  it('calls the deleteList cloud function for large lists', async () => {
    await applyPendingMutation({
      id: 'deleteList:list-big',
      type: 'deleteList',
      entityId: 'list-big',
      payload: { listId: 'list-big' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(deleteListFnMock).toHaveBeenCalledWith({ listId: 'list-big' });
  });
});
