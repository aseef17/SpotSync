import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllForListMock = vi.fn();
const fetchGroupedPassportSheetVenuesMock = vi.fn();
const writePlaceCreateAndLinkToListMock = vi.fn();
const fetchListAccessFieldsForWriteMock = vi.fn();
const batchCommitMock = vi.fn().mockResolvedValue(undefined);
const batchSetMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  writeBatch: vi.fn(() => ({
    set: batchSetMock,
    commit: batchCommitMock,
  })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({
    path: path.join('/'),
    withConverter: vi.fn(function (this: { path: string }) {
      return this;
    }),
  })),
}));

vi.mock('@/lib/localDb/repositories/placeRepository', () => ({
  placeRepository: {
    getAllForList: (...args: unknown[]) => getAllForListMock(...args),
  },
}));

vi.mock('@/features/passport/lib/parsePassportSheet', () => ({
  fetchGroupedPassportSheetVenues: (...args: unknown[]) =>
    fetchGroupedPassportSheetVenuesMock(...args),
}));

vi.mock('@/features/places/api/placeFirestoreWrite', () => ({
  writePlaceCreateAndLinkToList: (...args: unknown[]) => writePlaceCreateAndLinkToListMock(...args),
}));

vi.mock('@/features/places/utils/fetchListAccessFieldsForWrite', () => ({
  fetchListAccessFieldsForWrite: (...args: unknown[]) => fetchListAccessFieldsForWriteMock(...args),
}));

vi.mock('@/features/places/utils/stablePassportManualId', () => ({
  stablePassportManualId: vi.fn(async (name: string) => `manual_passport_${name.toLowerCase()}`),
}));

import { syncPassportListFromSheet } from '@/features/passport/api/passportSheetSyncService';

describe('syncPassportListFromSheet', () => {
  beforeEach(() => {
    getAllForListMock.mockReset();
    fetchGroupedPassportSheetVenuesMock.mockReset();
    writePlaceCreateAndLinkToListMock.mockReset();
    fetchListAccessFieldsForWriteMock.mockReset();
    batchCommitMock.mockClear();
    batchSetMock.mockClear();

    fetchListAccessFieldsForWriteMock.mockResolvedValue({
      listOwnerId: 'owner-1',
      listIsPublic: false,
      listCollaboratorIds: ['owner-1'],
    });
  });

  it('loads all list places instead of trusting a partial in-memory subset', async () => {
    getAllForListMock.mockResolvedValue([
      {
        id: 'list-1_ChIJabc',
        googlePlaceId: 'ChIJabc',
        name: 'Queens Public Library',
        passportStampIds: ['misha-tyutyunik'],
        status: 'not_visited',
      },
    ]);
    fetchGroupedPassportSheetVenuesMock.mockResolvedValue([
      {
        title: 'Queens Public Library',
        normalizedTitle: 'queens public library',
        stampIds: ['misha-tyutyunik', 'aashita-verma'],
        notes: ['Note A'],
        location: 'Queens',
        passportCategory: 'Library',
      },
    ]);

    const result = await syncPassportListFromSheet({
      listId: 'list-1',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id/edit',
      userId: 'owner-1',
      list: { ownerId: 'owner-1', isPublic: false },
    });

    expect(getAllForListMock).toHaveBeenCalledWith({
      listId: 'list-1',
      userId: 'owner-1',
      ownerId: 'owner-1',
      isPublic: false,
    });
    expect(writePlaceCreateAndLinkToListMock).not.toHaveBeenCalled();
    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it('does not create duplicates when only a paginated UI subset was previously visible', async () => {
    getAllForListMock.mockResolvedValue([
      {
        id: 'list-1_manual_passport_queens public library',
        googlePlaceId: 'manual_passport_queens public library',
        name: 'Queens Public Library',
        passportStampIds: ['misha-tyutyunik'],
        status: 'not_visited',
      },
    ]);
    fetchGroupedPassportSheetVenuesMock.mockResolvedValue([
      {
        title: 'Queens Public Library',
        normalizedTitle: 'queens public library',
        stampIds: ['misha-tyutyunik'],
        notes: [],
        location: 'Queens',
      },
    ]);

    const result = await syncPassportListFromSheet({
      listId: 'list-1',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id/edit',
      userId: 'owner-1',
      list: { ownerId: 'owner-1', isPublic: false },
    });

    expect(writePlaceCreateAndLinkToListMock).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
    expect(result.unchanged).toBe(1);
  });
});
