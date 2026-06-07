import type { Place } from '@/features/places/types/place';
import { omit } from '@/utils/objectUtils';

export const GOOGLE_PLACE_PHOTO_FIELDS = ['photoUrls', 'thumbnailUrl', 'photoCount'] as const;

export type GooglePlacePhotoFields = Pick<
  Place,
  (typeof GOOGLE_PLACE_PHOTO_FIELDS)[number]
>;

/** Split Google metadata sync from photo fields that must not hit Firestore until upload succeeds. */
export function partitionGoogleSyncUpdates(updates: Partial<Place>): {
  metadataUpdates: Partial<Place>;
  photoUpdates: Partial<GooglePlacePhotoFields>;
} {
  const metadataUpdates = omit(updates, [...GOOGLE_PLACE_PHOTO_FIELDS]);
  const photoUpdates: Partial<GooglePlacePhotoFields> = {};

  for (const key of GOOGLE_PLACE_PHOTO_FIELDS) {
    const value = updates[key];
    if (value !== undefined) {
      photoUpdates[key] = value as GooglePlacePhotoFields[typeof key];
    }
  }

  return { metadataUpdates, photoUpdates };
}

export function isFirebaseStoragePhotoUrl(url: string | undefined): boolean {
  return !!url?.includes('firebasestorage.googleapis.com');
}
