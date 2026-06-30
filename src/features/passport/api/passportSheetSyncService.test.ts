import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllForListMock = vi.fn();
const fetchGroupedPassportSheetVenuesMock = vi.fn();
const writePlaceCreateAndLinkToListMock = vi.fn();
const deletePlaceMembershipMock = vi.fn();
const fetchListAccessFieldsForWriteMock = vi.fn();
const bulkCreatePlacesMock = vi.fn();
const reconcileListPermissionsIfOwnerMock = vi.fn();
const resolvePlaceDetailsForImportMock = vi.fn();
const migrateLegacyMembershipToCanonicalMock = vi.fn();
const batchCommitMock = vi.fn().mockResolvedValue(undefined);
const batchSetMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'owner-1' } },
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
  updateDoc: vi.fn(),
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
  deletePlaceMembership: (...args: unknown[]) => deletePlaceMembershipMock(...args),
}));

vi.mock('@/features/places/utils/fetchListAccessFieldsForWrite', () => ({
  fetchListAccessFieldsForWrite: (...args: unknown[]) => fetchListAccessFieldsForWriteMock(...args),
}));

vi.mock('@/features/places/utils/stablePassportManualId', () => ({
  stablePassportManualId: vi.fn(async (name: string) => `manual_passport_${name.toLowerCase()}`),
}));

vi.mock('@/features/places/api/placeService', () => ({
  PlaceService: {
    bulkCreatePlaces: (...args: unknown[]) => bulkCreatePlacesMock(...args),
  },
}));

vi.mock('@/features/lists/utils/listPermissionSync', () => ({
  reconcileListPermissionsIfOwner: (...args: unknown[]) =>
    reconcileListPermissionsIfOwnerMock(...args),
  assertUserCanWriteList: vi.fn(),
}));

vi.mock('@/features/places/api/googleMapsService', () => ({
  GoogleMapsService: {
    resolvePlaceDetailsForImport: (...args: unknown[]) => resolvePlaceDetailsForImportMock(...args),
  },
}));

vi.mock('@/features/places/utils/resolveWritableMembershipId', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/places/utils/resolveWritableMembershipId')>();
  return {
    ...actual,
    migrateLegacyMembershipToCanonical: (...args: unknown[]) =>
      migrateLegacyMembershipToCanonicalMock(...args),
  };
});

import { syncPassportListFromSheet } from '@/features/passport/api/passportSheetSyncService';
import type { PlaceList } from '@/features/lists/types/list';

const ownerList: PlaceList = {
  id: 'list-1',
  name: 'Passport',
  ownerId: 'owner-1',
  isPublic: false,
  collaborators: [],
  collaboratorIds: ['owner-1'],
  editorIds: ['owner-1'],
  places: [],
  customStatuses: [],
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('syncPassportListFromSheet', () => {
  beforeEach(() => {
    getAllForListMock.mockReset();
    fetchGroupedPassportSheetVenuesMock.mockReset();
    writePlaceCreateAndLinkToListMock.mockReset();
    deletePlaceMembershipMock.mockReset();
    fetchListAccessFieldsForWriteMock.mockReset();
    bulkCreatePlacesMock.mockReset();
    reconcileListPermissionsIfOwnerMock.mockReset();
    resolvePlaceDetailsForImportMock.mockReset();
    migrateLegacyMembershipToCanonicalMock.mockReset();
    batchCommitMock.mockClear();
    batchSetMock.mockClear();

    reconcileListPermissionsIfOwnerMock.mockImplementation(async (_listId, list) => list);
    deletePlaceMembershipMock.mockResolvedValue(undefined);
    bulkCreatePlacesMock.mockResolvedValue({ successCount: 0, failedCount: 0, errors: [] });
    resolvePlaceDetailsForImportMock.mockResolvedValue({ details: null, canonicalId: null });
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
        location: { lat: 40.7, lng: -73.9 },
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
      list: ownerList,
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
        location: { lat: 0, lng: 0 },
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
      list: ownerList,
    });

    expect(writePlaceCreateAndLinkToListMock).not.toHaveBeenCalled();
    expect(bulkCreatePlacesMock).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
    expect(result.unchanged).toBe(0);
  });

  it('removes orphan manual_passport duplicates when a canonical place exists for the same name', async () => {
    const places = [
      {
        id: 'list-1_ChIJbotanical',
        googlePlaceId: 'ChIJbotanical',
        name: 'New York Botanical Garden',
        passportStampIds: ['stamp-a'],
        status: 'not_visited',
        location: { lat: 40.862, lng: -73.877 },
      },
      {
        id: 'list-1_manual_passport_new york botanical garden',
        googlePlaceId: 'manual_passport_new york botanical garden',
        name: 'New York Botanical Garden',
        passportStampIds: ['stamp-a'],
        status: 'not_visited',
        location: { lat: 0, lng: 0 },
      },
    ];

    getAllForListMock.mockResolvedValue(places);
    fetchGroupedPassportSheetVenuesMock.mockResolvedValue([
      {
        title: 'New York Botanical Garden',
        normalizedTitle: 'new york botanical garden',
        stampIds: ['stamp-a'],
        notes: [],
        location: 'Bronx',
      },
    ]);

    const result = await syncPassportListFromSheet({
      listId: 'list-1',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id/edit',
      userId: 'owner-1',
      list: ownerList,
    });

    expect(deletePlaceMembershipMock).toHaveBeenCalledWith(
      'list-1_manual_passport_new york botanical garden',
      'list-1'
    );
    expect(result.cleaned).toBe(1);
    expect(result.unchanged).toBe(1);
  });

  it('does not remove manual_passport rows when the only keeper is also unenriched', async () => {
    const places = [
      {
        id: 'list-1_ChIJwrong',
        googlePlaceId: 'ChIJwrong',
        name: 'New York Botanical Garden',
        passportStampIds: ['stamp-a'],
        status: 'not_visited',
        location: { lat: 0, lng: 0 },
      },
      {
        id: 'list-1_manual_passport_new york botanical garden',
        googlePlaceId: 'manual_passport_new york botanical garden',
        name: 'New York Botanical Garden',
        passportStampIds: ['stamp-a'],
        status: 'not_visited',
        location: { lat: 0, lng: 0 },
      },
    ];

    getAllForListMock.mockResolvedValue(places);
    fetchGroupedPassportSheetVenuesMock.mockResolvedValue([
      {
        title: 'New York Botanical Garden',
        normalizedTitle: 'new york botanical garden',
        stampIds: ['stamp-a'],
        notes: [],
        location: 'Bronx',
      },
    ]);

    const result = await syncPassportListFromSheet({
      listId: 'list-1',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id/edit',
      userId: 'owner-1',
      list: ownerList,
    });

    expect(deletePlaceMembershipMock).not.toHaveBeenCalled();
    expect(result.cleaned).toBe(0);
  });
});
