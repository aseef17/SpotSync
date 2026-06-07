import { describe, expect, it } from 'vitest';
import { partitionGoogleSyncPhotoFields } from '@/features/places/utils/placeHelpers';

describe('partitionGoogleSyncPhotoFields', () => {
  it('keeps photo metadata out of the initial place update payload', () => {
    const googleUpdates = {
      name: 'Updated Cafe',
      photoUrls: ['places/ChIJ/photos/new-ref'],
      thumbnailUrl: 'places/ChIJ/photos/new-ref',
      photoCount: 1,
    };

    const { metadataUpdates } = partitionGoogleSyncPhotoFields(googleUpdates, [
      'https://firebasestorage.googleapis.com/v0/b/app/o/photo.webp',
    ]);

    expect(metadataUpdates).toEqual({ name: 'Updated Cafe' });
    expect(metadataUpdates).not.toHaveProperty('photoUrls');
    expect(metadataUpdates).not.toHaveProperty('thumbnailUrl');
    expect(metadataUpdates).not.toHaveProperty('photoCount');
  });

  it('preserves existing Firebase photo URLs when Google returns no photos', () => {
    const existing = ['https://firebasestorage.googleapis.com/v0/b/app/o/photo.webp'];
    const { photoUrlsForSync } = partitionGoogleSyncPhotoFields({ photoUrls: [] }, existing);

    expect(photoUrlsForSync).toEqual(existing);
  });
});
