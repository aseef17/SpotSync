import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocMock } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
    getDoc: getDocMock,
    onSnapshot: vi.fn(),
  };
});

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('@/lib/localDb/subscriptionRegistry', () => ({
  acquireSubscription: vi.fn(),
}));

vi.mock('@/lib/localDb/placeCache', () => ({
  removeCachedPlace: vi.fn(),
  upsertCachedPlace: vi.fn(),
}));

vi.mock('@/lib/localDb/changeBus', () => ({
  changeTopics: {
    place: vi.fn((id: string) => `place:${id}`),
    placesForList: vi.fn((id: string) => `places:${id}`),
  },
  emitChange: vi.fn(),
}));

vi.mock('@/features/places/api/listPlaceMembershipFirestore', () => ({
  buildListPlaceMembershipsQuery: vi.fn(),
  listPlaceMembershipDocRef: vi.fn((id: string) => ({ collection: 'listPlaces', id })),
}));

import { shouldRemovePlaceAfterSnapshotRemoval } from '@/lib/localDb/sync/placeSync';

describe('shouldRemovePlaceAfterSnapshotRemoval', () => {
  beforeEach(() => {
    getDocMock.mockReset();
  });

  it('removes immediately when the subscription is unlimited', async () => {
    await expect(shouldRemovePlaceAfterSnapshotRemoval('place-1', 0)).resolves.toBe(true);
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it('keeps cached places that only fell out of a limited query window', async () => {
    getDocMock.mockResolvedValue({ exists: () => true });

    await expect(shouldRemovePlaceAfterSnapshotRemoval('place-1', 500)).resolves.toBe(false);
  });

  it('removes cached places when the Firestore document was deleted', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });

    await expect(shouldRemovePlaceAfterSnapshotRemoval('place-1', 500)).resolves.toBe(true);
  });
});
