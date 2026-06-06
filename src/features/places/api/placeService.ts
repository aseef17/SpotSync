import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  onSnapshot,
} from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Place, PlaceStatus } from '@/features/places/types/place';
import { logger } from '@/utils/logger';
import { toMilliseconds } from '@/utils/date';
import { omit } from '@/utils/objectUtils';

export const placeConverter: FirestoreDataConverter<Place> = {
  toFirestore(place: Place): DocumentData {
    return omit(place, ['id']);
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Place {
    const data = snapshot.data(options);

    const validStatuses: PlaceStatus[] = ['not_visited', 'visited', 'not_going', 'custom'];
    const status =
      typeof data.status === 'string' && validStatuses.includes(data.status as PlaceStatus)
        ? data.status
        : 'not_visited';

    return {
      ...data,
      id: snapshot.id,
      name: typeof data.name === 'string' ? data.name : 'Unknown',
      address: typeof data.address === 'string' ? data.address : '',
      status: status,
      addedAt: data.addedAt?.toDate ? data.addedAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    } as Place;
  },
};

export class PlaceService {
  static async createPlace(
    listId: string,
    placeData: Omit<Place, 'id' | 'addedAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      if (placeData.plusCode || placeData.googlePlaceId) {
        const existingPlace = await this.findDuplicatePlace(listId, placeData);
        if (existingPlace) {
          throw new Error('Place already exists in this list');
        }
      }

      const placeRef = doc(collection(db, 'places'));
      const newPlace: Omit<Place, 'id'> = {
        ...placeData,
        listId,
        addedAt: new Date(),
        updatedAt: new Date(),
      };

      await setDoc(placeRef, newPlace);
      const placeId = placeRef.id;

      await updateDoc(doc(db, 'lists', listId), {
        places: arrayUnion(placeId),
        updatedAt: new Date(),
      });

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
    placesData: Array<Omit<Place, 'id' | 'addedAt' | 'updatedAt'>>
  ): Promise<{
    successCount: number;
    failedCount: number;
    errors: Array<{ index: number; error: string }>;
  }> {
    const BATCH_SIZE = 500;
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ index: number; error: string }> = [];

    try {
      // Process in chunks of 500
      for (let i = 0; i < placesData.length; i += BATCH_SIZE) {
        const chunk = placesData.slice(i, Math.min(i + BATCH_SIZE, placesData.length));
        const batch = writeBatch(db);
        const placeIds: string[] = [];

        for (let j = 0; j < chunk.length; j++) {
          const placeData = chunk[j];
          const placeRef = doc(collection(db, 'places'));
          const newPlace: Omit<Place, 'id'> = {
            ...placeData,
            listId,
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

  static async getPlace(placeId: string): Promise<Place | null> {
    try {
      const placeDoc = await getDoc(doc(db, 'places', placeId).withConverter(placeConverter));
      if (placeDoc.exists()) {
        return placeDoc.data();
      }
      return null;
    } catch (error) {
      logger.error('Error getting place:', error);
      throw error;
    }
  }

  static async getListPlaces(listId: string): Promise<Place[]> {
    try {
      const q = query(
        collection(db, 'places').withConverter(placeConverter),
        where('listId', '==', listId)
      );
      const querySnapshot = await getDocs(q);
      const places = querySnapshot.docs.map((doc) => doc.data());
      // Sort client-side desc
      return places.sort((a, b) => {
        const aTime = toMilliseconds(a.addedAt);
        const bTime = toMilliseconds(b.addedAt);
        return bTime - aTime;
      });
    } catch (error) {
      logger.error('Error getting list places:', error);
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

      await updateDoc(doc(db, 'places', placeId), updateData);
    } catch (error) {
      logger.error('Error updating place:', error);
      throw error;
    }
  }

  static async deletePlace(placeId: string, listId: string, userId?: string): Promise<void> {
    try {
      if (userId) {
        await updateDoc(doc(db, 'places', placeId), {
          deletedBy: userId,
          deletedAt: new Date(),
        });
      }

      await updateDoc(doc(db, 'lists', listId), {
        places: arrayRemove(placeId),
        updatedAt: new Date(),
      });

      await deleteDoc(doc(db, 'places', placeId));
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
      const updates: Partial<Place> & { updatedAt: Date; updatedBy?: string } = {
        status,
        updatedAt: new Date(),
      };

      // Only include customStatus if it's provided, otherwise omit it
      if (customValue !== undefined) {
        updates.customStatus = customValue;
      }

      // Only include updatedBy if userId is provided
      if (userId) {
        updates.updatedBy = userId;
      }

      await updateDoc(doc(db, 'places', placeId), updates);
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
      let q;

      // Try to find by plus code first (most reliable)
      if (placeData.plusCode) {
        q = query(
          collection(db, 'places').withConverter(placeConverter),
          where('listId', '==', listId),
          where('plusCode', '==', placeData.plusCode)
        );
      } else if (placeData.googlePlaceId) {
        // Fallback to Google Place ID
        q = query(
          collection(db, 'places').withConverter(placeConverter),
          where('listId', '==', listId),
          where('googlePlaceId', '==', placeData.googlePlaceId)
        );
      } else {
        // Fallback to name and address similarity (less reliable)
        const places = await this.getListPlaces(listId);
        return (
          places.find(
            (p) =>
              p.name.toLowerCase() === placeData.name?.toLowerCase() &&
              p.address.toLowerCase() === placeData.address?.toLowerCase()
          ) || null
        );
      }

      if (q) {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const doc = querySnapshot.docs[0];
          return doc.data();
        }
      }

      return null;
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
      const places = await this.getListPlaces(listId);
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
      let places = await this.getListPlaces(listId);

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

  static async askList(listId: string, query: string): Promise<{ placeIds: string[] }> {
    try {
      // Lazy import to avoid circular dependencies if any
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('@/lib/firebase');

      const askListFn = httpsCallable<{ listId: string; query: string }, { placeIds: string[] }>(
        functions,
        'askList'
      );
      const result = await askListFn({ listId, query });
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

  static async syncListPhotos(listId: string): Promise<void> {
    try {
      const { PhotoService } = await import('@/features/places/api/photoService');
      const { GoogleMapsService } = await import('@/features/places/api/googleMapsService');
      const places = await this.getListPlaces(listId);

      for (const place of places) {
        if (!place.photoUrls || place.photoUrls.length === 0) continue;

        const maxPhotos = Math.min(10, place.photoUrls.length); // Fetch max 10 photos
        const updatedPhotoUrls = [...place.photoUrls];
        let hasUpdates = false;

        let photoCache: Cache | null = null;
        try {
          photoCache = await caches.open('places-photo-cache');
        } catch (e) {
          logger.warn('Cache API not available', e);
        }

        for (let i = 0; i < maxPhotos; i++) {
          let rawUrl = updatedPhotoUrls[i];

          if (!rawUrl) continue;

          // Skip if already stored in Firebase
          if (rawUrl.includes('firebasestorage.googleapis.com')) continue;

          const googlePlaceId = place.googlePlaceId || place.id;
          const photoHash = this.getPhotoHash(rawUrl);

          // Check if another list has already uploaded this place's photo to Firebase
          const existingFirebaseUrl = await PhotoService.getSharedPlacePhotoUrl(
            googlePlaceId,
            photoHash
          );
          if (existingFirebaseUrl) {
            updatedPhotoUrls[i] = existingFirebaseUrl;
            hasUpdates = true;
            logger.info(`Reused existing globally synced photo ${photoHash} for place ${place.id}`);
            continue;
          }

          try {
            let fetchUrl = rawUrl.startsWith('places/')
              ? GoogleMapsService.getPhotoUrl(rawUrl, 1200, 1200)
              : rawUrl;

            let response: Response | undefined;
            if (photoCache) {
              response = await photoCache.match(fetchUrl);
            }

            if (!response) {
              response = await fetch(fetchUrl);
              if (response.ok && photoCache) {
                photoCache.put(fetchUrl, response.clone());
              }
            }

            // If token expired (400 Bad Request), try fetching fresh place details to get a new photo token
            if (!response.ok && response.status === 400) {
              logger.warn(
                `Photo token might be expired for place ${place.id}, refreshing details...`
              );
              const freshDetails = await GoogleMapsService.getPlaceDetails(googlePlaceId);

              if (freshDetails && freshDetails.photos && freshDetails.photos.length > i) {
                const photoUrlObj = freshDetails.photos[i].getUrl;
                const freshPhotoName =
                  typeof photoUrlObj === 'function'
                    ? photoUrlObj({
                        maxWidth: 1200,
                        maxHeight: 1200,
                      })
                    : photoUrlObj;
                fetchUrl = GoogleMapsService.getPhotoUrl(freshPhotoName, 1200, 1200);

                if (photoCache) {
                  response = await photoCache.match(fetchUrl);
                }
                if (!response) {
                  response = await fetch(fetchUrl);
                  if (response.ok && photoCache) {
                    photoCache.put(fetchUrl, response.clone());
                  }
                }

                if (response.ok) {
                  rawUrl = freshPhotoName;
                }
              }
            }

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const blob = await response.blob();
            let fileToUpload = new File([blob], `photo_${googlePlaceId}_${photoHash}.jpg`, {
              type: blob.type || 'image/jpeg',
            });

            try {
              const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1200,
                useWebWorker: true,
                fileType: 'image/webp',
              };
              fileToUpload = await imageCompression(fileToUpload, options);
            } catch (err) {
              logger.warn('Image compression failed, uploading original', err);
            }

            const firebasePhotoUrl = await PhotoService.uploadSharedPlacePhoto(
              fileToUpload,
              googlePlaceId,
              photoHash
            );

            updatedPhotoUrls[i] = firebasePhotoUrl;
            hasUpdates = true;
            logger.info(`Synced photo ${photoHash} for place ${place.id}`);
          } catch (photoErr) {
            logger.error(`Failed to sync photo ${photoHash} for place ${place.id}`, photoErr);
          }
        }

        if (hasUpdates) {
          await this.updatePlace(place.id, {
            photoUrls: updatedPhotoUrls,
          });
        }
      }
    } catch (error) {
      logger.error('Error syncing list photos:', error);
      throw error;
    }
  }

  static subscribeToListPlaces(
    listId: string,
    onUpdate: (places: Place[]) => void,
    onError: (error: Error) => void
  ): () => void {
    const q = query(
      collection(db, 'places').withConverter(placeConverter),
      where('listId', '==', listId)
    );

    return onSnapshot(
      q,
      (querySnapshot) => {
        const places = querySnapshot.docs.map((doc) => doc.data());
        // Sort client-side desc
        const sortedPlaces = places.sort((a, b) => {
          const aTime = toMilliseconds(a.addedAt);
          const bTime = toMilliseconds(b.addedAt);
          return bTime - aTime;
        });
        onUpdate(sortedPlaces);
      },
      (err) => {
        logger.error('Error subscribing to list places:', err);
        onError(err);
      }
    );
  }
}
