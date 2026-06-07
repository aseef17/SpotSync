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

const PHOTO_FETCH_TIMEOUT_MS = 30_000;

const inFlight = new Map<string, Promise<Blob | null>>();
const invalidationGeneration = new Map<string, number>();
const photoWarmInFlightByList = new Map<string, number>();
const photoWarmListeners = new Set<() => void>();

function notifyPhotoWarmListeners(): void {
  photoWarmListeners.forEach((listener) => listener());
}

function adjustPhotoWarmInFlight(listId: string, delta: number): void {
  const next = Math.max(0, (photoWarmInFlightByList.get(listId) ?? 0) + delta);
  if (next === 0) {
    photoWarmInFlightByList.delete(listId);
  } else {
    photoWarmInFlightByList.set(listId, next);
  }
  notifyPhotoWarmListeners();
}

export function getPhotoWarmInFlightForList(listId: string): number {
  return photoWarmInFlightByList.get(listId) ?? 0;
}

/** @deprecated Prefer getPhotoWarmInFlightForList — global sum is only for legacy callers. */
export function getPhotoWarmInFlight(): number {
  let total = 0;
  for (const count of photoWarmInFlightByList.values()) {
    total += count;
  }
  return total;
}

export function subscribePhotoWarmInFlight(listener: () => void): () => void {
  photoWarmListeners.add(listener);
  return () => {
    photoWarmListeners.delete(listener);
  };
}

function buildInFlightKey(placeId: string, photoIndex: number, photoRef: string): string {
  return `${placeId}:${photoIndex}:${photoRef}`;
}

function getInvalidationGeneration(placeId: string): number {
  return invalidationGeneration.get(placeId) ?? 0;
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

async function fetchRemotePhotoBlobWithTimeout(
  photoRef: string,
  maxWidth = 800,
  maxHeight = 800
): Promise<Blob | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      fetchRemotePhotoBlob(photoRef, maxWidth, maxHeight),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), PHOTO_FETCH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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
  invalidationGeneration.set(placeId, getInvalidationGeneration(placeId) + 1);

  for (const key of inFlight.keys()) {
    if (key.startsWith(`${placeId}:`)) {
      inFlight.delete(key);
    }
  }

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
  maxHeight = 800,
  listId?: string
): Promise<Blob | null> {
  if (!photoRef) {
    return null;
  }

  const cached = await readPlacePhotoBlob(placeId, photoIndex);
  if (cached) {
    return cached;
  }

  const inFlightKey = buildInFlightKey(placeId, photoIndex, photoRef);
  const pending = inFlight.get(inFlightKey);
  if (pending) {
    return pending;
  }

  const generationAtStart = getInvalidationGeneration(placeId);

  const promise = (async () => {
    if (listId) {
      adjustPhotoWarmInFlight(listId, 1);
    }
    try {
      const blob = await fetchRemotePhotoBlobWithTimeout(photoRef, maxWidth, maxHeight);
      if (blob && getInvalidationGeneration(placeId) === generationAtStart) {
        await writePlacePhotoBlob(placeId, photoIndex, blob);
      }
      return blob;
    } catch (error) {
      logger.debug('Failed to load place photo into cache:', error);
      return null;
    } finally {
      if (listId) {
        adjustPhotoWarmInFlight(listId, -1);
      }
      inFlight.delete(inFlightKey);
    }
  })();

  inFlight.set(inFlightKey, promise);
  return promise;
}

/** Warm the primary thumbnail in the background after SQL place data is stored. */
export function warmPlaceThumbnailCache(
  listId: string,
  placeId: string,
  thumbnailRef: string | undefined
): void {
  if (!thumbnailRef || typeof window === 'undefined') {
    return;
  }

  const run = () => {
    void loadPlacePhotoBlob(placeId, thumbnailRef, 0, 400, 400, listId);
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 0);
  }
}
