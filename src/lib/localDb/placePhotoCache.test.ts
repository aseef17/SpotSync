import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  readPlacePhotoBlobMock,
  writePlacePhotoBlobMock,
  deletePlacePhotoBlobsMock,
  fetchPhotoBlobMock,
} = vi.hoisted(() => ({
  readPlacePhotoBlobMock: vi.fn(),
  writePlacePhotoBlobMock: vi.fn(),
  deletePlacePhotoBlobsMock: vi.fn(),
  fetchPhotoBlobMock: vi.fn(),
}));

vi.mock('@/lib/localDb/placePhotoIdb', () => ({
  readPlacePhotoBlob: readPlacePhotoBlobMock,
  writePlacePhotoBlob: writePlacePhotoBlobMock,
  deletePlacePhotoBlobs: deletePlacePhotoBlobsMock,
  clearPlacePhotoIdb: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  storage: {},
}));

vi.mock('@/features/places/api/photoService', () => ({
  PhotoService: {
    fetchPhotoBlob: fetchPhotoBlobMock,
  },
}));

vi.mock('@/features/places/api/googleMapsService', () => ({
  GoogleMapsService: {
    getPhotoUrl: vi.fn(() => 'https://example.com/photo.jpg'),
  },
}));

import { invalidatePlacePhotos, loadPlacePhotoBlob } from '@/lib/localDb/placePhotoCache';

describe('loadPlacePhotoBlob invalidation race', () => {
  beforeEach(() => {
    readPlacePhotoBlobMock.mockReset();
    writePlacePhotoBlobMock.mockReset();
    deletePlacePhotoBlobsMock.mockReset();
    fetchPhotoBlobMock.mockReset();

    readPlacePhotoBlobMock.mockResolvedValue(null);
    deletePlacePhotoBlobsMock.mockResolvedValue(undefined);
    writePlacePhotoBlobMock.mockResolvedValue(undefined);
  });

  it('does not repopulate IndexedDB when photo fields are invalidated mid-fetch', async () => {
    let resolveFetch: ((blob: Blob) => void) | undefined;
    const fetchPromise = new Promise<Blob>((resolve) => {
      resolveFetch = resolve;
    });

    fetchPhotoBlobMock.mockReturnValue(fetchPromise);

    const loadPromise = loadPlacePhotoBlob('place-1', 'google-photo-ref-a', 0);
    await Promise.resolve();
    await invalidatePlacePhotos('place-1');

    resolveFetch?.(new Blob(['bytes'], { type: 'image/jpeg' }));
    await loadPromise;

    expect(deletePlacePhotoBlobsMock).toHaveBeenCalledWith('place-1');
    expect(writePlacePhotoBlobMock).not.toHaveBeenCalled();
  });
});
