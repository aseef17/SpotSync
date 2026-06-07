import { collection, doc, updateDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  loadPlacePhotoBlob,
  patchCachedPlace,
  queueOfflineMutation,
  removeCachedPlace,
  upsertCachedPlace,
} from '@/lib/localDb';
import { listRepository } from '@/lib/localDb/repositories/listRepository';
import { placeRepository } from '@/lib/localDb/repositories/placeRepository';
import { PLACES_PAGE_SIZE } from '@/features/places/api/placeFirestore';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { PhotoService } from '@/features/places/api/photoService';
import type { Place, PlaceStatus } from '@/features/places/types/place';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';
import { omit } from '@/utils/objectUtils';
import {
  getPlaceListAccessFields,
  getPrimaryPhotoUrl,
  trimPhotoUrlsForStorage,
  type PlaceListAccessFields,
} from '@/features/places/utils/placeAccess';
import {
  isFirebaseStoragePhotoUrl,
  partitionGoogleSyncUpdates,
} from '@/features/places/utils/placeGoogleSync';
import imageCompression from 'browser-image-compression';

export {
  PLACES_PAGE_SIZE,
  PLACES_SUBSCRIPTION_LIMIT,
  placeConverter,
} from '@/features/places/api/placeFirestore';
/** Firestore allows 500 ops per batch; bulk create also updates the parent list doc. */
export const BULK_CREATE_BATCH_SIZE = 499;

export class PlaceService {
  private static async fetchListAccessFields(listId: string): Promise<PlaceListAccessFields> {
    const list = await listRepository.getById(listId);
    if (!list) {
      throw new Error('List not found');
    }
    return getPlaceListAccessFields(list);
  }

  private static enrichPlaceWrite(
    placeData: Omit<Place, 'id' | 'addedAt' | 'updatedAt'>,
    accessFields: PlaceListAccessFields,
    options?: { suppressNotifications?: boolean }
  ): Omit<Place, 'id' | 'addedAt' | 'updatedAt'> {
    const trimmedPhotos = trimPhotoUrlsForStorage(placeData.photoUrls);
    const thumbnailUrl = placeData.thumbnailUrl ?? getPrimaryPhotoUrl(trimmedPhotos);
    const photoCount = placeData.photoUrls?.length ?? trimmedPhotos?.length;

    return {
      ...placeData,
      ...accessFields,
      ...(trimmedPhotos ? { photoUrls: trimmedPhotos } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(photoCount !== undefined ? { photoCount } : {}),
      ...(options?.suppressNotifications ? { suppressNotifications: true } : {}),
    };
  }

  private static async resolveListAccessFields(listId: string): Promise<PlaceListAccessFields> {
    const cachedList = await listRepository.getById(listId);
    if (cachedList) {
      return getPlaceListAccessFields(cachedList);
    }

    return this.fetchListAccessFields(listId);
  }

  static async createPlace(
    listId: string,
    placeData: Omit<Place, 'id' | 'addedAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      if (isBrowserOnline() && (placeData.plusCode || placeData.googlePlaceId)) {
        const existingPlace = await this.findDuplicatePlace(listId, placeData);
        if (existingPlace) {
          throw new Error('Place already exists in this list');
        }
      }

      const accessFields = await this.resolveListAccessFields(listId);
      const placeRef = doc(collection(db, 'places'));
      const newPlace = this.enrichPlaceWrite({ ...placeData, listId }, accessFields);
      const placeId = placeRef.id;
      const placeWithTimestamps: Place = {
        ...newPlace,
        id: placeId,
        addedAt: new Date(),
        updatedAt: new Date(),
      };

      await queueOfflineMutation(
        'createPlace',
        placeId,
        {
          placeId,
          listId,
          place: omit(placeWithTimestamps, ['id']),
        },
        async () => {
          await upsertCachedPlace(placeWithTimestamps);
        }
      );

      return placeId;
    } catch (error) {
      logger.error('Error creating place:', error);
      throw error;
    }
  }

  /**
   * Bulk create multiple places using Firestore batch writes
   * More efficient than individual writes - reduces cost and latency
   * Firestore allows max 500 operations per batch
   */
  static async bulkCreatePlaces(
    listId: string,
    placesData: Array<Omit<Place, 'id' | 'addedAt' | 'updatedAt'>>,
    options?: { suppressNotifications?: boolean }
  ): Promise<{
    successCount: number;
    failedCount: number;
    errors: Array<{ index: number; error: string }>;
  }> {
    const BATCH_SIZE = BULK_CREATE_BATCH_SIZE;
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ index: number; error: string }> = [];

    try {
      const accessFields = await this.fetchListAccessFields(listId);
      const suppressNotifications = options?.suppressNotifications ?? false;

      // Process in chunks of 500
      for (let i = 0; i < placesData.length; i += BATCH_SIZE) {
        const chunk = placesData.slice(i, Math.min(i + BATCH_SIZE, placesData.length));
        const batch = writeBatch(db);
        const placeIds: string[] = [];

        for (let j = 0; j < chunk.length; j++) {
          const placeData = chunk[j];
          const placeRef = doc(collection(db, 'places'));
          const enriched = this.enrichPlaceWrite({ ...placeData, listId }, accessFields, {
            suppressNotifications,
          });
          const newPlace: Omit<Place, 'id'> = {
            ...enriched,
            addedAt: new Date(),
            updatedAt: new Date(),
          };

          batch.set(placeRef, newPlace);
          placeIds.push(placeRef.id);
        }

        const listRef = doc(db, 'lists', listId);
        batch.update(listRef, {
          places: arrayUnion(...placeIds),
          updatedAt: new Date(),
        });

        try {
          await batch.commit();
          successCount += chunk.length;
          logger.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: Added ${chunk.length} places`);
        } catch (batchError) {
          logger.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, batchError);
          failedCount += chunk.length;

          for (let k = 0; k < chunk.length; k++) {
            errors.push({
              index: i + k,
              error: batchError instanceof Error ? batchError.message : 'Batch commit failed',
            });
          }
        }
      }

      return { successCount, failedCount, errors };
    } catch (error) {
      logger.error('Error in bulk create:', error);
      throw error;
    }
  }

  static async updatePlace(
    placeId: string,
    updates: Partial<Place>,
    userId?: string
  ): Promise<void> {
    try {
      const updateData: Partial<Place> & { updatedAt: Date; updatedBy?: string } = {
        ...updates,
        updatedAt: new Date(),
      };

      if (userId) {
        updateData.updatedBy = userId;
      }

      await queueOfflineMutation(
        'updatePlace',
        placeId,
        { placeId, updates: updateData },
        async () => {
          await patchCachedPlace(placeId, updateData);
        }
      );
    } catch (error) {
      logger.error('Error updating place:', error);
      throw error;
    }
  }

  static async deletePlace(placeId: string, listId: string, userId?: string): Promise<void> {
    try {
      await queueOfflineMutation('deletePlace', placeId, { placeId, listId, userId }, async () => {
        await removeCachedPlace(placeId);
      });
    } catch (error) {
      logger.error('Error deleting place:', error);
      throw error;
    }
  }

  static async updatePlaceStatus(
    placeId: string,
    status: PlaceStatus,
    userId?: string,
    customValue?: string
  ): Promise<void> {
    try {
      const updatedAt = new Date();
      const cachePatch: Partial<Place> = {
        status,
        updatedAt,
      };

      if (customValue !== undefined) {
        cachePatch.customStatus = customValue;
      } else if (status !== 'custom') {
        cachePatch.customStatus = undefined;
      }

      if (userId) {
        cachePatch.updatedBy = userId;
      }

      await queueOfflineMutation(
        'updatePlaceStatus',
        placeId,
        { placeId, status, userId, customValue },
        async () => {
          await patchCachedPlace(placeId, cachePatch);
        }
      );
    } catch (error) {
      logger.error('Error updating place status:', error);
      throw error;
    }
  }

  static async findDuplicatePlace(
    listId: string,
    placeData: Partial<Place>
  ): Promise<Place | null> {
    try {
      return placeRepository.findDuplicateInList(listId, placeData);
    } catch (error) {
      logger.error('Error finding duplicate place:', error);
      throw error;
    }
  }

  static async bulkUpdatePlaces(placeIds: string[], updates: Partial<Place>): Promise<void> {
    try {
      const batch = writeBatch(db);

      for (const placeId of placeIds) {
        batch.update(doc(db, 'places', placeId), {
          ...updates,
          updatedAt: new Date(),
        });
      }

      await batch.commit();
    } catch (error) {
      logger.error('Error bulk updating places:', error);
      throw error;
    }
  }

  static async searchPlaces(listId: string, searchTerm: string): Promise<Place[]> {
    try {
      const places = await placeRepository.getAllForList(listId);
      const lowercaseSearch = searchTerm.toLowerCase();

      return places.filter(
        (place) =>
          place.name.toLowerCase().includes(lowercaseSearch) ||
          place.address.toLowerCase().includes(lowercaseSearch) ||
          place.category?.toLowerCase().includes(lowercaseSearch) ||
          place.notes?.toLowerCase().includes(lowercaseSearch)
      );
    } catch (error) {
      logger.error('Error searching places:', error);
      throw error;
    }
  }

  static async filterPlaces(
    listId: string,
    filters: {
      status?: PlaceStatus;
      category?: string;
      minRating?: number;
      maxRating?: number;
      priceLevel?: number;
    }
  ): Promise<Place[]> {
    try {
      let places = await placeRepository.getAllForList(listId);

      if (filters.status) {
        places = places.filter((p) => p.status === filters.status);
      }

      if (filters.category) {
        places = places.filter((p) =>
          p.category?.toLowerCase().includes(filters.category!.toLowerCase())
        );
      }

      if (filters.minRating !== undefined) {
        places = places.filter((p) => (p.rating || 0) >= filters.minRating!);
      }

      if (filters.maxRating !== undefined) {
        places = places.filter((p) => (p.rating || 0) <= filters.maxRating!);
      }

      if (filters.priceLevel !== undefined) {
        places = places.filter((p) => {
          let level = p.priceLevel;
          if (typeof level === 'string') {
            const priceMap: Record<string, number> = {
              PRICE_LEVEL_FREE: 0,
              PRICE_LEVEL_INEXPENSIVE: 1,
              PRICE_LEVEL_MODERATE: 2,
              PRICE_LEVEL_EXPENSIVE: 3,
              PRICE_LEVEL_VERY_EXPENSIVE: 4,
            };
            level = typeof level === 'string' ? (priceMap[level] ?? 0) : 0;
          }
          return (level ?? 0) === filters.priceLevel;
        });
      }

      return places;
    } catch (error) {
      logger.error('Error filtering places:', error);
      throw error;
    }
  }

  static async resolvePlaceFromDetails(place: {
    title: string;
    address?: string;
    location?: { lat: number; lng: number };
  }): Promise<{ placeId: string; location?: { lat: number; lng: number } } | null> {
    try {
      // Ensure Google Maps API is loaded
      if (!window.google || !window.google.maps || !window.google.maps.places) {
        throw new Error('Google Maps API not loaded');
      }

      const service = new window.google.maps.places.PlacesService(document.createElement('div'));
      // Prefer address if available for better accuracy, otherwise just title
      const query = place.address ? `${place.title}, ${place.address}` : place.title;

      return new Promise((resolve) => {
        const request: google.maps.places.FindPlaceFromQueryRequest = {
          query,
          fields: ['place_id', 'geometry'],
          locationBias: place.location
            ? new window.google.maps.Circle({
                center: place.location,
                radius: 500, // 500m bias
              })
            : undefined,
        };

        service.findPlaceFromQuery(request, (results, status) => {
          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            results &&
            results.length > 0 &&
            results[0].place_id
          ) {
            resolve({
              placeId: results[0].place_id,
              location: results[0].geometry?.location
                ? {
                    lat: results[0].geometry.location.lat(),
                    lng: results[0].geometry.location.lng(),
                  }
                : undefined,
            });
          } else {
            // If FindPlaceFromQuery fails, try TextSearch as fallback (more expensive but broader)
            const textSearchRequest: google.maps.places.TextSearchRequest = {
              query,
              location: place.location
                ? { lat: place.location.lat, lng: place.location.lng }
                : undefined,
              radius: 1000,
            };
            service.textSearch(textSearchRequest, (tsResults, tsStatus) => {
              if (
                tsStatus === window.google.maps.places.PlacesServiceStatus.OK &&
                tsResults &&
                tsResults.length > 0 &&
                tsResults[0].place_id
              ) {
                resolve({
                  placeId: tsResults[0].place_id!,
                  location: tsResults[0].geometry?.location
                    ? {
                        lat: tsResults[0].geometry.location.lat(),
                        lng: tsResults[0].geometry.location.lng(),
                      }
                    : undefined,
                });
              } else {
                resolve(null);
              }
            });
          }
        });
      });
    } catch (error) {
      logger.error('Error resolving place:', error);
      return null;
    }
  }

  static async askList(
    listId: string,
    queryText: string,
    placesSummary?: Array<{
      id: string;
      name: string;
      notes?: string;
      category?: string;
      status?: string;
      address?: string;
    }>
  ): Promise<{ placeIds: string[] }> {
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('@/lib/firebase');

      const askListFn = httpsCallable<
        {
          listId: string;
          query: string;
          placesSummary?: Array<{
            id: string;
            name: string;
            notes?: string;
            category?: string;
            status?: string;
            address?: string;
          }>;
        },
        { placeIds: string[] }
      >(functions, 'askList');
      const result = await askListFn({ listId, query: queryText, placesSummary });
      return result.data;
    } catch (error) {
      logger.error('Error asking list:', error);
      throw error;
    }
  }

  static getPhotoHash(url: string): string {
    if (url.includes('/photos/')) {
      const parts = url.split('/photos/');
      if (parts.length > 1) {
        const hashPart = parts[1].split('/')[0];
        return hashPart.split('?')[0];
      }
    }

    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private static async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    if (items.length === 0) return;

    let nextIndex = 0;
    const runWorker = async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await worker(items[currentIndex], currentIndex);
      }
    };

    const workerCount = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  }

  private static async openPhotoCache(): Promise<Cache | null> {
    try {
      return await caches.open('places-photo-cache');
    } catch (error) {
      logger.warn('Cache API not available', error);
      return null;
    }
  }

  private static resolvePhotoFetchUrl(rawUrl: string): string {
    return rawUrl.startsWith('places/')
      ? GoogleMapsService.getPhotoUrl(rawUrl, 1200, 1200)
      : rawUrl;
  }

  private static async listFreshGooglePhotoRefs(googlePlaceId: string): Promise<string[]> {
    const freshDetails = await GoogleMapsService.getPlaceDetails(googlePlaceId, { skipCache: true });
    if (!freshDetails) {
      return [];
    }
    return GoogleMapsService.extractPhotoResourceNames(freshDetails);
  }

  private static async getFreshGooglePhotoRef(
    googlePlaceId: string,
    photoIndex: number
  ): Promise<string | null> {
    const freshRefs = await this.listFreshGooglePhotoRefs(googlePlaceId);
    return freshRefs[photoIndex] ?? null;
  }

  private static async refreshStaleGooglePhotoRefs(
    place: Place,
    updatedPhotoUrls: string[],
    maxPhotos: number
  ): Promise<boolean> {
    const googlePlaceId = place.googlePlaceId;
    if (!googlePlaceId) {
      return false;
    }

    let needsRefresh = false;
    for (let i = 0; i < maxPhotos; i++) {
      const url = updatedPhotoUrls[i];
      if (!url || url.includes('firebasestorage.googleapis.com')) {
        continue;
      }
      if (!(await PhotoService.isGooglePhotoRefValid(url))) {
        needsRefresh = true;
        break;
      }
    }

    if (!needsRefresh) {
      return false;
    }

    logger.warn(
      `Refreshing expired Google photo refs for place ${place.id} (${place.name}) from Places API`
    );
    const freshRefs = await this.listFreshGooglePhotoRefs(googlePlaceId);
    if (freshRefs.length === 0) {
      return false;
    }

    let changed = false;
    for (let i = 0; i < maxPhotos; i++) {
      const current = updatedPhotoUrls[i];
      // Never downgrade durable Firebase URLs to ephemeral Google refs when HEAD fails.
      if (isFirebaseStoragePhotoUrl(current)) {
        continue;
      }
      if (freshRefs[i] && current !== freshRefs[i]) {
        updatedPhotoUrls[i] = freshRefs[i];
        changed = true;
      }
    }

    return changed;
  }

  private static async syncPlacePhotos(
    place: Place,
    photoCache: Cache | null
  ): Promise<{ photoUrls: string[] | null; photoFailures: number }> {
    if (!place.photoUrls || place.photoUrls.length === 0) {
      return { photoUrls: null, photoFailures: 0 };
    }

    const maxPhotos = Math.min(10, place.photoUrls.length);
    const updatedPhotoUrls = [...place.photoUrls];
    const photoIndexes = Array.from({ length: maxPhotos }, (_, index) => index);
    let hasUpdates = false;
    let photoFailures = 0;

    const googlePlaceId = place.googlePlaceId;
    if (!googlePlaceId) {
      logger.warn(
        `Place ${place.id} (${place.name}) has no googlePlaceId; skipping photo sync`
      );
      return { photoUrls: null, photoFailures: maxPhotos };
    }

    if (await this.refreshStaleGooglePhotoRefs(place, updatedPhotoUrls, maxPhotos)) {
      hasUpdates = true;
    }

    await this.runWithConcurrency(photoIndexes, 3, async (photoIndex) => {
      let rawUrl = updatedPhotoUrls[photoIndex];
      if (!rawUrl) return;

      if (rawUrl.includes('firebasestorage.googleapis.com')) {
        if (await PhotoService.storageUrlExists(rawUrl)) {
          return;
        }
        logger.warn(`Stale Firebase photo for place ${place.id}, re-syncing index ${photoIndex}`);
        const freshRef = await this.getFreshGooglePhotoRef(googlePlaceId, photoIndex);
        if (!freshRef) {
          photoFailures += 1;
          return;
        }
        rawUrl = freshRef;
      }

      let photoHash = this.getPhotoHash(rawUrl);
      let fetchUrl = this.resolvePhotoFetchUrl(rawUrl);

      const existingFirebaseUrl = await PhotoService.getSharedPlacePhotoUrl(
        googlePlaceId,
        photoHash
      );
      if (existingFirebaseUrl && (await PhotoService.storageUrlExists(existingFirebaseUrl))) {
        updatedPhotoUrls[photoIndex] = existingFirebaseUrl;
        hasUpdates = true;
        logger.info(`Reused existing globally synced photo ${photoHash} for place ${place.id}`);
        return;
      }

      try {
        let blob = await PhotoService.fetchPhotoBlob(fetchUrl, photoCache, rawUrl);
        if (!blob) {
          const freshRef = await this.getFreshGooglePhotoRef(googlePlaceId, photoIndex);
          if (freshRef) {
            rawUrl = freshRef;
            photoHash = this.getPhotoHash(rawUrl);
            fetchUrl = this.resolvePhotoFetchUrl(rawUrl);
            blob = await PhotoService.fetchPhotoBlob(fetchUrl, photoCache, rawUrl);
          }
        }

        if (!blob) {
          photoFailures += 1;
          logger.error(
            `Failed to sync photo ${photoHash} for place ${place.id}: unable to fetch photo bytes`
          );
          return;
        }

        let fileToUpload = new File([blob], `photo_${googlePlaceId}_${photoHash}.jpg`, {
          type: blob.type || 'image/jpeg',
        });

        try {
          fileToUpload = await imageCompression(fileToUpload, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1200,
            useWebWorker: true,
            fileType: 'image/webp',
          });
        } catch (err) {
          logger.warn('Image compression failed, uploading original', err);
        }

        const firebasePhotoUrl = await PhotoService.uploadSharedPlacePhoto(
          fileToUpload,
          googlePlaceId,
          photoHash
        );

        updatedPhotoUrls[photoIndex] = firebasePhotoUrl;
        hasUpdates = true;
        logger.info(`Synced photo ${photoHash} for place ${place.id}`);
      } catch (photoErr) {
        photoFailures += 1;
        logger.error(`Failed to sync photo ${photoHash} for place ${place.id}`, photoErr);
      }
    });

    return {
      photoUrls: hasUpdates ? updatedPhotoUrls : null,
      photoFailures,
    };
  }

  /**
   * Photo sync writes Firestore + local cache directly (not the offline mutation queue)
   * so bulk metadata updates do not flash the pending-sync banner.
   */
  private static async persistPhotoSyncMetadata(
    placeId: string,
    photoUrls: string[]
  ): Promise<void> {
    const trimmed = trimPhotoUrlsForStorage(photoUrls) ?? photoUrls;
    const updates = {
      photoUrls: trimmed,
      thumbnailUrl: getPrimaryPhotoUrl(trimmed),
      photoCount: photoUrls.length,
      updatedAt: new Date(),
    };

    if (isBrowserOnline()) {
      await updateDoc(doc(db, 'places', placeId), updates);
    }

    await patchCachedPlace(placeId, updates);
  }

  private static buildGoogleSyncUpdates(
    converted: Omit<Place, 'id' | 'addedAt' | 'updatedAt' | 'status'>
  ): Partial<Place> {
    const googleFields = omit(converted, ['listId', 'addedBy']);
    const updates: Partial<Place> = { ...googleFields };

    if (updates.photoUrls) {
      updates.thumbnailUrl = getPrimaryPhotoUrl(updates.photoUrls);
      updates.photoCount = updates.photoUrls.length;
    }

    return updates;
  }

  /**
   * Refreshes Google-sourced place metadata from the Places API (skipCache) and
   * uploads photos to shared Firebase Storage. Preserves list-specific fields
   * such as status, notes, and addedBy.
   */
  static async syncPlaceFromGoogle(
    placeId: string,
    userId?: string
  ): Promise<{ place: Place | null; photoFailures: number }> {
    const place = await placeRepository.getById(placeId);
    if (!place) {
      throw new Error('Place not found');
    }
    if (!place.googlePlaceId) {
      throw new Error('Place has no Google Place ID');
    }

    const details = await GoogleMapsService.getPlaceDetails(place.googlePlaceId, {
      skipCache: true,
    });
    if (!details) {
      throw new Error('Could not fetch place details from Google');
    }

    const converted = GoogleMapsService.convertGooglePlaceToPlace(details, place.listId);
    const googleUpdates = this.buildGoogleSyncUpdates(converted);
    const { metadataUpdates, photoUpdates } = partitionGoogleSyncUpdates(googleUpdates);

    // Persist Google metadata first; photo URLs are written only after upload succeeds.
    await this.updatePlace(placeId, metadataUpdates, userId);

    const mergedPlace: Place = {
      ...place,
      ...metadataUpdates,
      ...photoUpdates,
      id: placeId,
    };
    const photoCache = await this.openPhotoCache();
    const { photoUrls: syncedPhotoUrls, photoFailures } = await this.syncPlacePhotos(
      mergedPlace,
      photoCache
    );

    if (syncedPhotoUrls) {
      await this.persistPhotoSyncMetadata(placeId, syncedPhotoUrls);
    }

    const updatedPlace = await placeRepository.getById(placeId);
    return { place: updatedPlace, photoFailures };
  }

  static async syncListPhotos(listId: string): Promise<{
    placesProcessed: number;
    placesUpdated: number;
    photoFailures: number;
    placePersistFailures: number;
  }> {
    const result = {
      placesProcessed: 0,
      placesUpdated: 0,
      photoFailures: 0,
      placePersistFailures: 0,
    };

    try {
      const photoCache = await this.openPhotoCache();

      let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
      let hasMore = true;

      while (hasMore) {
        const page = await placeRepository.fetchPage(listId, PLACES_PAGE_SIZE, cursor);
        hasMore = page.hasMore;
        cursor = page.lastDoc ?? undefined;

        const placesWithPhotos = page.places.filter((place) => (place.photoUrls?.length ?? 0) > 0);

        await this.runWithConcurrency(placesWithPhotos, 5, async (place) => {
          result.placesProcessed += 1;

          try {
            const { photoUrls, photoFailures } = await this.syncPlacePhotos(place, photoCache);
            result.photoFailures += photoFailures;

            if (photoUrls) {
              try {
                await this.persistPhotoSyncMetadata(place.id, photoUrls);
                for (let i = 0; i < Math.min(10, photoUrls.length); i++) {
                  void loadPlacePhotoBlob(place.id, photoUrls[i], i, 1200, 1200);
                }
                result.placesUpdated += 1;
              } catch (persistErr) {
                result.placePersistFailures += 1;
                logger.error(`Failed to persist photo metadata for place ${place.id}`, persistErr);
              }
            }
          } catch (placeErr) {
            result.placePersistFailures += 1;
            logger.error(`Failed to sync photos for place ${place.id}`, placeErr);
          }
        });
      }

      logger.info('Photo sync complete', result);
      return result;
    } catch (error) {
      logger.error('Error syncing list photos:', error);
      throw error;
    }
  }
}
