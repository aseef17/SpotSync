import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMetadataMock, getDownloadURLMock } = vi.hoisted(() => ({
  getMetadataMock: vi.fn(),
  getDownloadURLMock: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  getMetadata: getMetadataMock,
  getDownloadURL: getDownloadURLMock,
}));

vi.mock('@/lib/firebase', () => ({
  storage: {},
}));

import { PhotoService } from '@/features/places/api/photoService';

describe('PhotoService.getSharedPlacePhotoUrl legacy fallback', () => {
  beforeEach(() => {
    getMetadataMock.mockReset();
    getDownloadURLMock.mockReset();
  });

  it('skips legacy photo_1.jpg when allowLegacyFallback is false', async () => {
    getMetadataMock.mockRejectedValue(new Error('missing webp'));

    const url = await PhotoService.getSharedPlacePhotoUrl('google-place-1', 'photo-hash-2', false);

    expect(url).toBeNull();
    expect(getMetadataMock).toHaveBeenCalledTimes(1);
  });

  it('uses legacy photo_1.jpg only when allowLegacyFallback is true', async () => {
    getMetadataMock
      .mockRejectedValueOnce(new Error('missing webp'))
      .mockResolvedValueOnce({ name: 'photo_1.jpg' });
    getDownloadURLMock.mockResolvedValue('https://example.com/legacy.jpg');

    const url = await PhotoService.getSharedPlacePhotoUrl('google-place-1', 'photo-hash-2', true);

    expect(url).toBe('https://example.com/legacy.jpg');
    expect(getMetadataMock).toHaveBeenCalledTimes(2);
  });
});
