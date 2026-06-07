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

import {
  getPhotoWarmInFlightForList,
  invalidatePlacePhotos,
  loadPlacePhotoBlob,
} from '@/lib/localDb/placePhotoCache';

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

describe('loadPlacePhotoBlob hydration tracking', () => {
  beforeEach(() => {
    readPlacePhotoBlobMock.mockReset();
    writePlacePhotoBlobMock.mockReset();
    fetchPhotoBlobMock.mockReset();

    readPlacePhotoBlobMock.mockResolvedValue(null);
    writePlacePhotoBlobMock.mockResolvedValue(undefined);
  });

  it('tracks in-flight warms per list, not globally across lists', async () => {
    let resolveListAFetch: ((blob: Blob) => void) | undefined;
    const listAFetch = new Promise<Blob>((resolve) => {
      resolveListAFetch = resolve;
    });

    fetchPhotoBlobMock.mockReturnValueOnce(listAFetch);

    const listAPromise = loadPlacePhotoBlob('place-a', 'google-photo-ref-a', 0, 400, 400, 'list-a');
    await Promise.resolve();

    expect(getPhotoWarmInFlightForList('list-a')).toBe(1);
    expect(getPhotoWarmInFlightForList('list-b')).toBe(0);

    fetchPhotoBlobMock.mockResolvedValueOnce(new Blob(['b'], { type: 'image/jpeg' }));
    const listBPromise = loadPlacePhotoBlob('place-b', 'google-photo-ref-b', 0, 400, 400, 'list-b');
    await listBPromise;

    expect(getPhotoWarmInFlightForList('list-b')).toBe(0);
    expect(getPhotoWarmInFlightForList('list-a')).toBe(1);

    resolveListAFetch?.(new Blob(['a'], { type: 'image/jpeg' }));
    await listAPromise;

    expect(getPhotoWarmInFlightForList('list-a')).toBe(0);
  });

  it('releases list warm counter when fetch times out', async () => {
    vi.useFakeTimers();

    let resolveFetch: ((blob: Blob) => void) | undefined;
    const fetchPromise = new Promise<Blob>((resolve) => {
      resolveFetch = resolve;
    });
    fetchPhotoBlobMock.mockReturnValue(fetchPromise);

    const loadPromise = loadPlacePhotoBlob('place-1', 'google-photo-ref-a', 0, 400, 400, 'list-a');
    await Promise.resolve();

    expect(getPhotoWarmInFlightForList('list-a')).toBe(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await loadPromise;

    expect(getPhotoWarmInFlightForList('list-a')).toBe(0);

    resolveFetch?.(new Blob(['late'], { type: 'image/jpeg' }));
    vi.useRealTimers();
  });
});
