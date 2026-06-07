import { describe, expect, it } from 'vitest';
import {
  coalesceDurablePhotoUrls,
  hasNewFirebasePhotoUpload,
  isFirebaseStoragePhotoUrl,
  partitionGoogleSyncUpdates,
} from '@/features/places/utils/placeGoogleSync';

const firebaseUrl =
  'https://firebasestorage.googleapis.com/v0/b/app/o/places%2Fshared%2Fx.webp?alt=media';
const ephemeralRef = 'places/ChIJx/photos/Abc123';

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

describe('coalesceDurablePhotoUrls', () => {
  it('keeps existing Firebase URLs when upload failed for that slot', () => {
    const original = [firebaseUrl, firebaseUrl];
    const synced = [
      'https://firebasestorage.googleapis.com/v0/b/app/o/places%2Fshared%2Fnew.webp?alt=media',
      ephemeralRef,
    ];

    expect(coalesceDurablePhotoUrls(synced, original)).toEqual([synced[0], firebaseUrl]);
  });

  it('does not treat refreshed ephemeral refs as durable replacements', () => {
    const original = [firebaseUrl];
    const synced = [ephemeralRef];

    expect(coalesceDurablePhotoUrls(synced, original)).toEqual([firebaseUrl]);
  });
});

describe('hasNewFirebasePhotoUpload', () => {
  it('returns true when at least one Firebase URL changed', () => {
    const original = [firebaseUrl];
    const persisted = [
      'https://firebasestorage.googleapis.com/v0/b/app/o/places%2Fshared%2Fnew.webp?alt=media',
    ];

    expect(hasNewFirebasePhotoUpload(persisted, original)).toBe(true);
  });

  it('returns false when no durable Firebase uploads occurred', () => {
    const original = [firebaseUrl];
    const persisted = [firebaseUrl];

    expect(hasNewFirebasePhotoUpload(persisted, original)).toBe(false);
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
