import type { Place } from '@/features/places/types/place';
import { omit } from '@/utils/objectUtils';

export const GOOGLE_PLACE_PHOTO_FIELDS = ['photoUrls', 'thumbnailUrl', 'photoCount'] as const;

export type GooglePlacePhotoFields = Pick<Place, (typeof GOOGLE_PLACE_PHOTO_FIELDS)[number]>;

/** Split Google metadata sync from photo fields that must not hit Firestore until upload succeeds. */
export function partitionGoogleSyncUpdates(updates: Partial<Place>): {
  metadataUpdates: Partial<Place>;
  photoUpdates: Partial<GooglePlacePhotoFields>;
} {
  const metadataUpdates = omit(updates, [...GOOGLE_PLACE_PHOTO_FIELDS]);
  const photoUpdates: Partial<GooglePlacePhotoFields> = {};

  if (updates.photoUrls !== undefined) {
    photoUpdates.photoUrls = updates.photoUrls;
  }
  if (updates.thumbnailUrl !== undefined) {
    photoUpdates.thumbnailUrl = updates.thumbnailUrl;
  }
  if (updates.photoCount !== undefined) {
    photoUpdates.photoCount = updates.photoCount;
  }

  return { metadataUpdates, photoUpdates };
}

export function isFirebaseStoragePhotoUrl(url: string | undefined): boolean {
  return !!url?.includes('firebasestorage.googleapis.com');
}

/** Preserve existing Firebase URLs when a slot's upload failed and still has an ephemeral ref. */
export function coalesceDurablePhotoUrls(
  syncedUrls: string[],
  originalUrls: string[] | undefined
): string[] {
  return syncedUrls.map((synced, index) => {
    if (isFirebaseStoragePhotoUrl(synced)) {
      return synced;
    }

    const original = originalUrls?.[index];
    if (isFirebaseStoragePhotoUrl(original)) {
      return original;
    }

    return synced;
  });
}

export function hasNewFirebasePhotoUpload(
  persistedUrls: string[],
  originalUrls: string[] | undefined
): boolean {
  return persistedUrls.some(
    (url, index) => isFirebaseStoragePhotoUrl(url) && url !== originalUrls?.[index]
  );
}
