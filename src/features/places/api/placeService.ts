import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Place, PlaceStatus } from '@/features/places/types/place';
import { logger } from '@/utils/logger';
import { toMilliseconds } from '@/utils/date';

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
      const placeDoc = await getDoc(doc(db, 'places', placeId));
      const data = placeDoc.data();
      if (placeDoc.exists() && data) {
        return {
          id: placeDoc.id,
          name: typeof data.name === 'string' ? data.name : 'Unknown',
          address: typeof data.address === 'string' ? data.address : '',
          status: this.isPlaceStatus(data.status) ? data.status : 'not_visited',
          ...data,
        } as Place;
      }
      return null;
    } catch (error) {
      logger.error('Error getting place:', error);
      throw error;
    }
  }

  private static isPlaceStatus(status: unknown): status is PlaceStatus {
    const validStatuses: PlaceStatus[] = ['not_visited', 'visited', 'not_going', 'custom'];
    return typeof status === 'string' && validStatuses.includes(status as PlaceStatus);
  }

  static async getListPlaces(listId: string): Promise<Place[]> {
    try {
      const q = query(collection(db, 'places'), where('listId', '==', listId));
      const querySnapshot = await getDocs(q);
      const places = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
        } as Place;
      });
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
          collection(db, 'places'),
          where('listId', '==', listId),
          where('plusCode', '==', placeData.plusCode)
        );
      } else if (placeData.googlePlaceId) {
        // Fallback to Google Place ID
        q = query(
          collection(db, 'places'),
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
          const data = doc.data();
          return {
            ...data,
            id: doc.id, // Must come after spread to override any stored 'id' field
            name: typeof data.name === 'string' ? data.name : 'Unknown',
            address: typeof data.address === 'string' ? data.address : '',
            status: this.isPlaceStatus(data.status) ? data.status : 'not_visited',
          } as Place;
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
}
