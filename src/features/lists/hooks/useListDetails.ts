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
import { shouldClearStaleListContextView } from '@/features/lists/hooks/listDetailsAccessGuard';
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
  const loadTrackingRef = useRef({
    listLoaded: false,
    hasCachedData: false,
    onProgress: null as (() => void) | null,
  });
  const listAccessibleRef = useRef(true);
  const hadListFromContextRef = useRef(!!listFromContext);

  useEffect(() => {
    if (listFromContext) {
      hadListFromContextRef.current = true;
      listAccessibleRef.current = true;
      setList(listFromContext);
      setError(null);
      loadTrackingRef.current.listLoaded = true;
      loadTrackingRef.current.hasCachedData = true;
      loadTrackingRef.current.onProgress?.();
      return;
    }

    if (
      shouldClearStaleListContextView(hadListFromContextRef.current, listFromContext, listId)
    ) {
      listAccessibleRef.current = false;
      setList(null);
      setPlaces([]);
      setError(null);
      loadTrackingRef.current.hasCachedData = false;
      loadTrackingRef.current.listLoaded = false;
      loadTrackingRef.current.onProgress?.();
    }
  }, [listFromContext, listId]);

  useEffect(() => {
    if (!listId || listFromContext) {
      return;
    }

    let cancelled = false;
    listAccessibleRef.current = false;
    loadTrackingRef.current.listLoaded = false;
    loadTrackingRef.current.onProgress?.();

    const unsubscribeList = ListService.subscribeToList(
      listId,
      (listData) => {
        if (cancelled) return;
        if (!listData) {
          listAccessibleRef.current = false;
          setList(null);
          setPlaces([]);
          setError('List not found');
          loadTrackingRef.current.hasCachedData = false;
        } else {
          listAccessibleRef.current = true;
          setList(listData);
          setError(null);
          loadTrackingRef.current.hasCachedData = true;
        }
        loadTrackingRef.current.listLoaded = true;
        loadTrackingRef.current.onProgress?.();
      },
      (err) => {
        if (cancelled) return;
        logger.error('Error listening to list:', err);
        listAccessibleRef.current = false;
        setList(null);
        setPlaces([]);
        setError(
          `Failed to load list data: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        loadTrackingRef.current.hasCachedData = false;
        loadTrackingRef.current.listLoaded = true;
        loadTrackingRef.current.onProgress?.();
      }
    );

    return () => {
      cancelled = true;
      unsubscribeList();
    };
  }, [listId, listFromContext]);

  useEffect(() => {
    if (!listId) {
      return;
    }

    let cancelled = false;
    listAccessibleRef.current = !!listFromContext;
    loadTrackingRef.current.listLoaded = !!listFromContext;
    loadTrackingRef.current.hasCachedData = !!listFromContext;
    let listLoaded = loadTrackingRef.current.listLoaded;
    let placesLoaded = false;
    let hasCachedData = loadTrackingRef.current.hasCachedData;
    paginationCursorRef.current = null;
    extraPlacesRef.current = [];
    setPlaces([]);
    setLoading(true);

    const finishLoading = () => {
      if (!cancelled && listLoaded && placesLoaded) {
        setLoading(false);
      }
    };

    loadTrackingRef.current.onProgress = () => {
      listLoaded = loadTrackingRef.current.listLoaded;
      hasCachedData = loadTrackingRef.current.hasCachedData;
      finishLoading();
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
        if (!cancelled && !hasCachedData && !loadTrackingRef.current.hasCachedData) {
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

    const unsubscribePlaces = PlaceService.subscribeToListPlaces(
      listId,
      (placesData) => {
        if (cancelled || !listAccessibleRef.current) return;
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
      loadTrackingRef.current.onProgress = null;
      window.clearTimeout(timeoutId);
      unsubscribePlaces();
    };
    // Only re-subscribe when the viewed list changes. List metadata syncs via the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listFromContext syncs in the effect above; lists via listsRef
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
