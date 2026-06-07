import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { PhotoService } from '@/features/places/api/photoService';
import { getPlacePhotoDisplayUrl } from '@/features/places/utils/placeHelpers';
import { logger } from '@/utils/logger';
import {
  clearPlacePhotoIdb,
  deletePlacePhotoBlobs,
  readPlacePhotoBlob,
  writePlacePhotoBlob,
} from '@/lib/localDb/placePhotoIdb';

export { didPlacePhotoFieldsChange } from '@/lib/localDb/placePhotoFields';

const inFlight = new Map<string, Promise<Blob | null>>();

function buildInFlightKey(placeId: string, photoIndex: number): string {
  return `${placeId}:${photoIndex}`;
}

async function fetchRemotePhotoBlob(
  photoRef: string,
  maxWidth = 800,
  maxHeight = 800
): Promise<Blob | null> {
  const remoteUrl = getPlacePhotoDisplayUrl(
    photoRef,
    GoogleMapsService.getPhotoUrl,
    maxWidth,
    maxHeight
  );
  if (!remoteUrl) {
    return null;
  }

  return PhotoService.fetchPhotoBlob(remoteUrl, null, photoRef);
}

/**
 * Returns a cached blob for this place photo slot, or null.
 * Does not hit the network.
 */
export async function getCachedPlacePhotoBlob(
  placeId: string,
  photoIndex: number
): Promise<Blob | null> {
  return readPlacePhotoBlob(placeId, photoIndex);
}

export async function cachePlacePhotoBlob(
  placeId: string,
  photoIndex: number,
  blob: Blob
): Promise<void> {
  await writePlacePhotoBlob(placeId, photoIndex, blob);
}

export async function invalidatePlacePhotos(placeId: string): Promise<void> {
  await deletePlacePhotoBlobs(placeId);
}

export async function clearPlacePhotoCache(): Promise<void> {
  await clearPlacePhotoIdb();
}

/**
 * Cache-first load: returns a blob from IndexedDB when present.
 * On miss, fetches once from remote and stores for subsequent renders.
 */
export async function loadPlacePhotoBlob(
  placeId: string,
  photoRef: string | undefined,
  photoIndex: number,
  maxWidth = 800,
  maxHeight = 800
): Promise<Blob | null> {
  if (!photoRef) {
    return null;
  }

  const cached = await readPlacePhotoBlob(placeId, photoIndex);
  if (cached) {
    return cached;
  }

  const inFlightKey = buildInFlightKey(placeId, photoIndex);
  const pending = inFlight.get(inFlightKey);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const blob = await fetchRemotePhotoBlob(photoRef, maxWidth, maxHeight);
      if (blob) {
        await writePlacePhotoBlob(placeId, photoIndex, blob);
      }
      return blob;
    } catch (error) {
      logger.debug('Failed to load place photo into cache:', error);
      return null;
    } finally {
      inFlight.delete(inFlightKey);
    }
  })();

  inFlight.set(inFlightKey, promise);
  return promise;
}

/** Warm the primary thumbnail in the background after SQL place data is stored. */
export function warmPlaceThumbnailCache(placeId: string, thumbnailRef: string | undefined): void {
  if (!thumbnailRef || typeof window === 'undefined') {
    return;
  }

  const run = () => {
    void loadPlacePhotoBlob(placeId, thumbnailRef, 0, 400, 400);
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 0);
  }
}
