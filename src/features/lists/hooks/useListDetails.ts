import { useState, useCallback, useEffect, useRef } from 'react';
import { ListService } from '@/features/lists/api/listService';
import {
  PlaceService,
  PLACES_PAGE_SIZE,
  PLACES_SUBSCRIPTION_LIMIT,
} from '@/features/places/api/placeService';
import { useListsContext } from '@/features/lists/context/useListsContext';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';
import type { PlaceList } from '@/features/lists/types/list';
import type { Place } from '@/features/places/types/place';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

const OFFLINE_LOAD_TIMEOUT_MS = 8000;

export const useListDetails = (listId: string | undefined) => {
  const { lists } = useListsContext();
  const listFromContext = listId ? lists.find((entry) => entry.id === listId) : undefined;

  const [list, setList] = useState<PlaceList | null>(listFromContext ?? null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [hasMorePlaces, setHasMorePlaces] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(!!listId);
  const [error, setError] = useState<string | null>(listId ? null : 'No list ID provided');
  const paginationCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const extraPlacesRef = useRef<Place[]>([]);
  const listsRef = useRef(lists);
  listsRef.current = lists;

  useEffect(() => {
    if (listFromContext) {
      setList(listFromContext);
      setError(null);
    }
  }, [listFromContext]);

  useEffect(() => {
    if (!listId) {
      return;
    }

    let cancelled = false;
    let listLoaded = !!listFromContext;
    let placesLoaded = false;
    let hasCachedData = !!listFromContext;
    paginationCursorRef.current = null;
    extraPlacesRef.current = [];
    setPlaces([]);
    setLoading(true);

    const finishLoading = () => {
      if (!cancelled && listLoaded && placesLoaded) {
        setLoading(false);
      }
    };

    const hydrateFromCache = async () => {
      const contextList = listsRef.current.find((entry) => entry.id === listId) ?? null;
      if (contextList) {
        setList(contextList);
        setError(null);
        listLoaded = true;
        hasCachedData = true;
        finishLoading();
      }

      const [cachedList, cachedPlaces] = await Promise.all([
        contextList ? Promise.resolve(null) : ListService.getListFromCache(listId),
        PlaceService.getListPlacesFromCache(listId),
      ]);

      if (cancelled) return;

      if (!contextList && cachedList) {
        setList(cachedList);
        setError(null);
        listLoaded = true;
        hasCachedData = true;
        finishLoading();
      }

      if (cachedPlaces && cachedPlaces.length > 0) {
        setPlaces(cachedPlaces);
        setHasMorePlaces(cachedPlaces.length >= PLACES_SUBSCRIPTION_LIMIT);
        placesLoaded = true;
        hasCachedData = true;
        finishLoading();
      }
    };

    void hydrateFromCache();

    const timeoutId = window.setTimeout(
      () => {
        if (!cancelled && !hasCachedData) {
          setLoading(false);
          if (!isBrowserOnline()) {
            setError('You appear to be offline and no cached data was found for this list.');
          } else {
            setError('Loading is taking longer than expected. Please check your connection.');
          }
        }
      },
      isBrowserOnline() ? OFFLINE_LOAD_TIMEOUT_MS : 3000
    );

    let unsubscribeList: (() => void) | undefined;

    if (!listFromContext) {
      unsubscribeList = ListService.subscribeToList(
        listId,
        (listData) => {
          if (cancelled) return;
          if (!listData) {
            if (!hasCachedData) {
              setError('List not found');
            }
          } else {
            setList(listData);
            setError(null);
            hasCachedData = true;
          }
          listLoaded = true;
          finishLoading();
        },
        (err) => {
          if (cancelled) return;
          logger.error('Error listening to list:', err);
          if (!hasCachedData) {
            setError(
              `Failed to load list data: ${err instanceof Error ? err.message : 'Unknown error'}`
            );
          }
          listLoaded = true;
          finishLoading();
        }
      );
    } else {
      listLoaded = true;
      finishLoading();
    }

    const unsubscribePlaces = PlaceService.subscribeToListPlaces(
      listId,
      (placesData) => {
        if (cancelled) return;
        const merged = [...placesData, ...extraPlacesRef.current];
        const seen = new Set<string>();
        const deduped = merged.filter((place) => {
          if (seen.has(place.id)) return false;
          seen.add(place.id);
          return true;
        });
        setPlaces(deduped);
        setHasMorePlaces(
          placesData.length >= PLACES_SUBSCRIPTION_LIMIT || paginationCursorRef.current !== null
        );
        placesLoaded = true;
        hasCachedData = hasCachedData || deduped.length > 0;
        finishLoading();
      },
      (err) => {
        if (cancelled) return;
        logger.error('Error listening to places:', err);
        placesLoaded = true;
        finishLoading();
      }
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      unsubscribeList?.();
      unsubscribePlaces();
    };
    // Only re-subscribe when the viewed list changes. List metadata syncs via the effect above.
  }, [listId]);

  const loadMorePlaces = useCallback(async () => {
    if (!listId || loadingMore) return;

    setLoadingMore(true);
    try {
      if (!paginationCursorRef.current) {
        const initialPage = await PlaceService.getListPlacesPage(listId, PLACES_SUBSCRIPTION_LIMIT);
        paginationCursorRef.current = initialPage.lastDoc;
        if (!initialPage.hasMore) {
          setHasMorePlaces(false);
          return;
        }
      }

      const cursor = paginationCursorRef.current;
      if (!cursor) {
        setHasMorePlaces(false);
        return;
      }

      const page = await PlaceService.loadMoreListPlaces(listId, cursor, PLACES_PAGE_SIZE);
      paginationCursorRef.current = page.lastDoc;
      extraPlacesRef.current = [...extraPlacesRef.current, ...page.places];

      setPlaces((current) => {
        const seen = new Set(current.map((place) => place.id));
        const appended = page.places.filter((place) => !seen.has(place.id));
        return [...current, ...appended];
      });
      setHasMorePlaces(page.hasMore);
    } catch (err) {
      logger.error('Error loading more places:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [listId, loadingMore]);

  const updateList = useCallback(
    async (targetListId: string, data: Partial<PlaceList>, userId?: string) => {
      try {
        await ListService.updateList(targetListId, data, userId);
      } catch (err) {
        logger.error('Error updating list:', err);
        throw err;
      }
    },
    []
  );

  return {
    list,
    places,
    loading,
    error,
    updateList,
    hasMorePlaces,
    loadingMore,
    loadMorePlaces,
  };
};
