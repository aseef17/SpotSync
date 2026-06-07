import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Place } from '@/features/places/types/place';
import type { PlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import { PLACES_PAGE_SIZE, PLACES_SUBSCRIPTION_LIMIT } from '@/features/places/api/placeFirestore';
import {
  applyPendingMutationsToPlace,
  applyPendingMutationsToPlaces,
  getCachedPlace,
  getCachedPlacesForList,
  getPendingMutations,
} from '@/lib/localDb';
import { changeTopics, subscribeToChanges } from '@/lib/localDb/changeBus';
import { acquireListPlacesSync } from '@/lib/localDb/sync/placeSync';
import {
  fetchDuplicatePlaceFromFirestore,
  fetchPlacesPageFromFirestore,
} from '@/lib/localDb/sync/placeFetch';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';

async function readPlacesForList(listId: string): Promise<Place[]> {
  const cached = await getCachedPlacesForList(listId);
  if (!cached) {
    return [];
  }

  const pendingMutations = await getPendingMutations();
  return applyPendingMutationsToPlaces(cached, pendingMutations);
}

function findDuplicateInPlaces(
  places: Place[],
  placeData: Partial<Place>
): Place | null {
  if (placeData.plusCode) {
    const match = places.find((place) => place.plusCode === placeData.plusCode);
    if (match) {
      return match;
    }
  }

  if (placeData.googlePlaceId) {
    const match = places.find((place) => place.googlePlaceId === placeData.googlePlaceId);
    if (match) {
      return match;
    }
  }

  if (placeData.name && placeData.address) {
    return (
      places.find(
        (place) =>
          place.name.toLowerCase() === placeData.name!.toLowerCase() &&
          place.address.toLowerCase() === placeData.address!.toLowerCase()
      ) ?? null
    );
  }

  return null;
}

export interface SubscribeToListPlacesOptions {
  enableSync?: boolean;
}

export const placeRepository = {
  async getById(placeId: string): Promise<Place | null> {
    const cached = await getCachedPlace(placeId);
    if (!cached) {
      return null;
    }

    const pendingMutations = await getPendingMutations();
    return applyPendingMutationsToPlace(cached, pendingMutations);
  },

  async getForList(listId: string): Promise<Place[]> {
    return readPlacesForList(listId);
  },

  async findDuplicateInList(listId: string, placeData: Partial<Place>): Promise<Place | null> {
    const cachedPlaces = await readPlacesForList(listId);
    const localMatch = findDuplicateInPlaces(cachedPlaces, placeData);
    if (localMatch) {
      return localMatch;
    }

    if (!isBrowserOnline() || (!placeData.plusCode && !placeData.googlePlaceId)) {
      return null;
    }

    return fetchDuplicatePlaceFromFirestore(listId, placeData);
  },

  async fetchPage(
    listId: string,
    pageSize: number = PLACES_PAGE_SIZE,
    cursor?: QueryDocumentSnapshot<DocumentData>
  ): Promise<{
    places: Place[];
    hasMore: boolean;
    lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  }> {
    if (!isBrowserOnline()) {
      const places = await readPlacesForList(listId);
      return { places, hasMore: false, lastDoc: null };
    }

    return fetchPlacesPageFromFirestore(listId, pageSize, cursor);
  },

  async getAllForList(listId: string): Promise<Place[]> {
    const cached = await readPlacesForList(listId);
    if (!isBrowserOnline()) {
      return cached;
    }

    const seenIds = new Set(cached.map((place) => place.id));
    let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
    let hasMore = true;

    while (hasMore) {
      const page = await fetchPlacesPageFromFirestore(listId, PLACES_PAGE_SIZE, cursor);
      for (const place of page.places) {
        seenIds.add(place.id);
      }
      hasMore = page.hasMore;
      cursor = page.lastDoc ?? undefined;
      if (!cursor) {
        break;
      }
    }

    return readPlacesForList(listId);
  },

  subscribeToListPlaces(
    access: PlaceListAccessQuery,
    onUpdate: (places: Place[]) => void,
    onError: (error: Error) => void,
    subscriptionLimit: number = PLACES_SUBSCRIPTION_LIMIT,
    options?: SubscribeToListPlacesOptions
  ): () => void {
    let cancelled = false;
    const enableSync = options?.enableSync !== false;

    const publish = async () => {
      if (cancelled) {
        return;
      }

      try {
        const places = await readPlacesForList(access.listId);
        onUpdate(places);
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Failed to read places from local store'));
      }
    };

    void publish();

    const releaseSync = enableSync ? acquireListPlacesSync(access, subscriptionLimit) : () => {};
    const unsubscribeChanges = subscribeToChanges(changeTopics.placesForList(access.listId), () => {
      void publish();
    });

    return () => {
      cancelled = true;
      releaseSync();
      unsubscribeChanges();
    };
  },
};
