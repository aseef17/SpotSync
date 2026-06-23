import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceList } from '@/features/lists/types/list';

const { getListFromServerMock, getByIdMock, isBrowserOnlineMock } = vi.hoisted(() => ({
  getListFromServerMock: vi.fn(),
  getByIdMock: vi.fn(),
  isBrowserOnlineMock: vi.fn(() => true),
}));

vi.mock('@/features/lists/api/listService', () => ({
  ListService: {
    getListFromServer: getListFromServerMock,
  },
}));

vi.mock('@/lib/localDb/repositories/listRepository', () => ({
  listRepository: {
    getById: getByIdMock,
  },
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  isBrowserOnline: isBrowserOnlineMock,
}));

import { fetchListAccessFieldsForWrite } from '@/features/places/utils/fetchListAccessFieldsForWrite';

function list(overrides: Partial<PlaceList> = {}): PlaceList {
  return {
    id: 'list-1',
    ownerId: 'owner-1',
    isPublic: false,
    name: 'Test list',
    collaborators: [],
    collaboratorIds: ['owner-1'],
    places: [],
    customStatuses: [],
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PlaceList;
}

describe('fetchListAccessFieldsForWrite', () => {
  beforeEach(() => {
    getListFromServerMock.mockReset();
    getByIdMock.mockReset();
    isBrowserOnlineMock.mockReturnValue(true);
  });

  it('uses server list access fields when online instead of stale cache', async () => {
    getListFromServerMock.mockResolvedValueOnce(list({ isPublic: false, collaboratorIds: ['owner-1'] }));
    getByIdMock.mockResolvedValueOnce(list({ isPublic: true, collaboratorIds: ['owner-1', 'user-2'] }));

    const accessFields = await fetchListAccessFieldsForWrite('list-1');

    expect(accessFields).toEqual({
      listOwnerId: 'owner-1',
      listIsPublic: false,
      listCollaboratorIds: ['owner-1'],
    });
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it('falls back to cached list access fields when offline', async () => {
    isBrowserOnlineMock.mockReturnValue(false);
    getByIdMock.mockResolvedValueOnce(list({ isPublic: false, collaboratorIds: ['owner-1'] }));

    const accessFields = await fetchListAccessFieldsForWrite('list-1');

    expect(accessFields.listIsPublic).toBe(false);
    expect(getListFromServerMock).not.toHaveBeenCalled();
  });

  it('throws when the list cannot be found on the server while online', async () => {
    getListFromServerMock.mockResolvedValueOnce(null);

    await expect(fetchListAccessFieldsForWrite('missing-list')).rejects.toThrow('List not found');
  });
});
