import { collection, doc, writeBatch, arrayUnion } from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  patchCachedPlace,
  queueOfflineMutation,
  removeCachedPlace,
  upsertCachedPlace,
} from '@/lib/localDb';
import { listRepository } from '@/lib/localDb/repositories/listRepository';
import { placeRepository } from '@/lib/localDb/repositories/placeRepository';
import { PLACES_PAGE_SIZE } from '@/features/places/api/placeFirestore';
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
import imageCompression from 'browser-image-compression';

export { PLACES_PAGE_SIZE, PLACES_SUBSCRIPTION_LIMIT, placeConverter } from '@/features/places/api/placeFirestore';
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
      await queueOfflineMutation(
        'deletePlace',
        placeId,
        { placeId, listId, userId },
        async () => {
          await removeCachedPlace(placeId);
        }
      );
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

  private static resolvePhotoFetchUrl(
    rawUrl: string,
    GoogleMapsService: typeof import('@/features/places/api/googleMapsService').GoogleMapsService
  ): string {
    return rawUrl.startsWith('places/')
      ? GoogleMapsService.getPhotoUrl(rawUrl, 1200, 1200)
      : rawUrl;
  }

  private static async syncPlacePhotos(
    place: Place,
    photoCache: Cache | null,
    PhotoService: typeof import('@/features/places/api/photoService').PhotoService,
    GoogleMapsService: typeof import('@/features/places/api/googleMapsService').GoogleMapsService
  ): Promise<string[] | null> {
    if (!place.photoUrls || place.photoUrls.length === 0) {
      return null;
    }

    const maxPhotos = Math.min(10, place.photoUrls.length);
    const updatedPhotoUrls = [...place.photoUrls];
    const photoIndexes = Array.from({ length: maxPhotos }, (_, index) => index);
    let hasUpdates = false;

    await this.runWithConcurrency(photoIndexes, 10, async (photoIndex) => {
      let rawUrl = updatedPhotoUrls[photoIndex];
      if (!rawUrl) return;

      if (rawUrl.includes('firebasestorage.googleapis.com')) {
        return;
      }

      const googlePlaceId = place.googlePlaceId || place.id;
      const photoHash = this.getPhotoHash(rawUrl);
      let fetchUrl = this.resolvePhotoFetchUrl(rawUrl, GoogleMapsService);

      const urlLoads = await PhotoService.remotePhotoUrlLoads(fetchUrl, photoCache);
      if (urlLoads) {
        logger.info(`Photo ${photoHash} for place ${place.id} loads — skipping sync`);
        return;
      }

      try {
        const probe = await fetch(fetchUrl);
        if (probe.status === 400) {
          logger.warn(`Photo token might be expired for place ${place.id}, refreshing details...`);
          const freshDetails = await GoogleMapsService.getPlaceDetails(googlePlaceId);
          if (freshDetails?.photos && freshDetails.photos.length > photoIndex) {
            const photoUrlObj = freshDetails.photos[photoIndex].getUrl;
            const freshPhotoName =
              typeof photoUrlObj === 'function'
                ? photoUrlObj({ maxWidth: 1200, maxHeight: 1200 })
                : photoUrlObj;
            rawUrl = freshPhotoName;
            fetchUrl = GoogleMapsService.getPhotoUrl(freshPhotoName, 1200, 1200);

            if (await PhotoService.remotePhotoUrlLoads(fetchUrl, photoCache)) {
              updatedPhotoUrls[photoIndex] = rawUrl;
              hasUpdates = true;
              return;
            }
          }
        }
      } catch {
        // Continue to shared-storage fallback and upload path.
      }

      const existingFirebaseUrl = await PhotoService.getSharedPlacePhotoUrl(
        googlePlaceId,
        photoHash
      );
      if (existingFirebaseUrl) {
        updatedPhotoUrls[photoIndex] = existingFirebaseUrl;
        hasUpdates = true;
        logger.info(`Reused existing globally synced photo ${photoHash} for place ${place.id}`);
        return;
      }

      try {
        const blob = await PhotoService.fetchPhotoBlob(fetchUrl, photoCache);
        if (!blob) {
          throw new Error('Unable to fetch photo bytes for upload');
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
        logger.error(`Failed to sync photo ${photoHash} for place ${place.id}`, photoErr);
      }
    });

    return hasUpdates ? updatedPhotoUrls : null;
  }

  static async syncListPhotos(listId: string): Promise<void> {
    try {
      const { PhotoService } = await import('@/features/places/api/photoService');
      const { GoogleMapsService } = await import('@/features/places/api/googleMapsService');
      const photoCache = await this.openPhotoCache();

      let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
      let hasMore = true;

      while (hasMore) {
        const page = await placeRepository.fetchPage(listId, PLACES_PAGE_SIZE, cursor);
        hasMore = page.hasMore;
        cursor = page.lastDoc ?? undefined;

        const placesWithPhotos = page.places.filter((place) => (place.photoUrls?.length ?? 0) > 0);

        await this.runWithConcurrency(placesWithPhotos, 10, async (place) => {
          const updatedPhotoUrls = await this.syncPlacePhotos(
            place,
            photoCache,
            PhotoService,
            GoogleMapsService
          );

          if (updatedPhotoUrls) {
            const trimmed = trimPhotoUrlsForStorage(updatedPhotoUrls) ?? updatedPhotoUrls;
            await this.updatePlace(place.id, {
              photoUrls: trimmed,
              thumbnailUrl: getPrimaryPhotoUrl(trimmed),
              photoCount: updatedPhotoUrls.length,
            });
          }
        });
      }
    } catch (error) {
      logger.error('Error syncing list photos:', error);
      throw error;
    }
  }

}
