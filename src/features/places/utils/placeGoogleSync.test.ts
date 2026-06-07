import { describe, expect, it } from 'vitest';
import {
  isFirebaseStoragePhotoUrl,
  partitionGoogleSyncUpdates,
} from '@/features/places/utils/placeGoogleSync';

describe('partitionGoogleSyncUpdates', () => {
  it('keeps photo fields out of metadata updates', () => {
    const { metadataUpdates, photoUpdates } = partitionGoogleSyncUpdates({
      name: 'Cafe',
      photoUrls: ['places/x/photos/y'],
      thumbnailUrl: 'places/x/photos/y',
      photoCount: 1,
      rating: 4.5,
    });

    expect(metadataUpdates).toEqual({ name: 'Cafe', rating: 4.5 });
    expect(photoUpdates).toEqual({
      photoUrls: ['places/x/photos/y'],
      thumbnailUrl: 'places/x/photos/y',
      photoCount: 1,
    });
  });

  it('returns empty photoUpdates when Google sync has no photo fields', () => {
    const { metadataUpdates, photoUpdates } = partitionGoogleSyncUpdates({ name: 'Cafe' });
    expect(metadataUpdates).toEqual({ name: 'Cafe' });
    expect(photoUpdates).toEqual({});
  });
});

describe('isFirebaseStoragePhotoUrl', () => {
  it('detects Firebase Storage download URLs', () => {
    expect(
      isFirebaseStoragePhotoUrl(
        'https://firebasestorage.googleapis.com/v0/b/app/o/places%2Fshared%2Fx.webp?alt=media'
      )
    ).toBe(true);
  });

  it('returns false for Google Places photo resource names', () => {
    expect(isFirebaseStoragePhotoUrl('places/ChIJx/photos/Abc123')).toBe(false);
  });
});
