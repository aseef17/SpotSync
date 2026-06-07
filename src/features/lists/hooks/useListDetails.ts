import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ListService } from '@/features/lists/api/listService';
import {
  PlaceService,
  PLACES_PAGE_SIZE,
  PLACES_SUBSCRIPTION_LIMIT,
} from '@/features/places/api/placeService';
import { subscribeToListPlacesShared } from '@/features/places/api/placeListSubscriptionStore';
import { getPlaceListAccessKey, toPlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useListsContext } from '@/features/lists/context/useListsContext';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import {
  isFirestorePermissionDenied,
  readPersistedListAccessRevoked,
  shouldClearStaleListView,
  shouldTrustPrivateListSnapshot,
  writePersistedListAccessRevoked,
} from '@/features/lists/hooks/listViewAccess';
import {
  resolveListFromContextAccess,
  shouldApplyCachedListDetails,
  shouldClearAccessRevokedOnContextReturn,
  shouldConfirmListAccessFromServerWhenRevoked,
  shouldHydrateCachedListSnapshot,
} from '@/features/lists/lib/listDetailAccessGuard';
import {
  shouldGrantListAccess,
  userCanReadList,
} from '@/features/lists/lib/listAccessFromSnapshot';
import {
  mergeSubscribedPlaces,
  resolvePlacesSnapshot,
  type PendingPlacesSnapshot,
} from '@/features/lists/lib/listPlacesSnapshot';
import { logger } from '@/utils/logger';
import type { PlaceList } from '@/features/lists/types/list';
import type { Place } from '@/features/places/types/place';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

const OFFLINE_LOAD_TIMEOUT_MS = 8000;

export const useListDetails = (listId: string | undefined) => {
  const { user } = useAuth();
  const { lists, loading: listsLoading } = useListsContext();
  const listFromContext = listId ? lists.find((entry) => entry.id === listId) : undefined;

  const [list, setList] = useState<PlaceList | null>(listFromContext ?? null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [hasMorePlaces, setHasMorePlaces] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(!!listId);
  const [error, setError] = useState<string | null>(listId ? null : 'No list ID provided');
  const [accessRevokedRevision, setAccessRevokedRevision] = useState(0);
  const setAccessRevoked = useCallback(
    (revoked: boolean) => {
      accessRevokedRef.current = revoked;
      writePersistedListAccessRevoked(user?.id, listId, revoked);
      if (!revoked) {
        privateAccessConfirmKeyRef.current = null;
        setAccessRevokedRevision((revision) => revision + 1);
      }
    },
    [listId, user?.id]
  );
  const confirmPrivateAccessFromServer = useCallback(
    (targetListId: string, userId: string) => {
      void ListService.getListFromServer(targetListId)
        .then((list) => {
          if (!list || !userCanReadList(list, userId)) {
            return;
          }
          privateListServerVerifiedRef.current = true;
          setAccessRevoked(false);
        })
        .catch(() => {
          // Permission denied or offline — keep sticky revocation; allow retry on later effect runs.
          privateAccessConfirmKeyRef.current = null;
        });
    },
    [setAccessRevoked]
  );
  const paginationCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const extraPlacesRef = useRef<Place[]>([]);
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const listAccessKey = useMemo(() => {
    if (!listId || !user?.id || !list) {
      return null;
    }
    return getPlaceListAccessKey(listId, user.id, list);
  }, [listId, user?.id, list?.ownerId, list?.isPublic]);

  const placeAccessQuery = useMemo(() => {
    if (!listId || !user?.id || !list) {
      return null;
    }
    return toPlaceListAccessQuery(listId, user.id, list);
  }, [listId, user?.id, list?.ownerId, list?.isPublic]);
  const loadTrackingRef = useRef({
    listLoaded: false,
    hasCachedData: false,
    onProgress: null as (() => void) | null,
  });
  const listAccessibleRef = useRef(true);
  const accessRevokedRef = useRef(false);
  const privateListServerVerifiedRef = useRef(false);
  const pendingPlacesSnapshotRef = useRef<PendingPlacesSnapshot>(undefined);
  const applyPendingPlacesRef = useRef<((placesData: Place[]) => void) | null>(null);
  const hadListFromContextRef = useRef(!!listFromContext);
  const privateAccessConfirmKeyRef = useRef<string | null>(null);

  const clearPendingPlacesSnapshot = useCallback(() => {
    pendingPlacesSnapshotRef.current = undefined;
  }, []);

  const flushPendingPlacesSnapshot = useCallback(() => {
    const pending = pendingPlacesSnapshotRef.current;
    if (pending === undefined) {
      return;
    }
    pendingPlacesSnapshotRef.current = undefined;
    applyPendingPlacesRef.current?.(pending);
  }, []);

  const denyListAccess = useCallback(() => {
    listAccessibleRef.current = false;
    clearPendingPlacesSnapshot();
  }, [clearPendingPlacesSnapshot]);

  useEffect(() => {
    hadListFromContextRef.current = false;
    privateAccessConfirmKeyRef.current = null;
    accessRevokedRef.current = readPersistedListAccessRevoked(user?.id, listId);
    privateListServerVerifiedRef.current = false;
  }, [listId, user?.id]);

  useEffect(() => {
    const hadListFromContext = hadListFromContextRef.current;
    hadListFromContextRef.current = !!listFromContext;

    if (listFromContext) {
      if (
        shouldClearAccessRevokedOnContextReturn({
          hadListFromContext,
          list: listFromContext,
          userId: user?.id,
        })
      ) {
        setAccessRevoked(false);
      } else if (
        listId &&
        user?.id &&
        shouldConfirmListAccessFromServerWhenRevoked({
          list: listFromContext,
          userId: user.id,
          accessRevoked: accessRevokedRef.current,
          isOnline: isBrowserOnline(),
        })
      ) {
        const confirmKey = `${user.id}:${listId}`;
        if (privateAccessConfirmKeyRef.current !== confirmKey) {
          privateAccessConfirmKeyRef.current = confirmKey;
          confirmPrivateAccessFromServer(listId, user.id);
        }
      }

      const contextAccess = resolveListFromContextAccess({
        list: listFromContext,
        userId: user?.id,
        accessRevoked: accessRevokedRef.current,
      });

      if (contextAccess !== 'grant') {
        // Saved-private rows are untrusted, not proof of revocation; keep accessRevoked unset
        // so owned/collaborator context can grant once the live query row arrives.
        if (contextAccess === 'deny-no-access') {
          setAccessRevoked(true);
        }
        denyListAccess();
        setList(null);
        setPlaces([]);
        setError('List not found');
        loadTrackingRef.current.listLoaded = true;
        loadTrackingRef.current.hasCachedData = false;
        loadTrackingRef.current.onProgress?.();
        return;
      }

      listAccessibleRef.current = true;
      flushPendingPlacesSnapshot();
      setList(listFromContext);
      setError(null);
      loadTrackingRef.current.listLoaded = true;
      loadTrackingRef.current.hasCachedData = true;
      loadTrackingRef.current.onProgress?.();
      return;
    }

    if (
      shouldClearStaleListView({
        listId,
        hadListFromContext,
        hasListFromContext: false,
        listsLoading,
      })
    ) {
      setAccessRevoked(true);
      denyListAccess();
      setList(null);
      setPlaces([]);
      setError('List not found');
      loadTrackingRef.current.listLoaded = true;
      loadTrackingRef.current.hasCachedData = false;
      loadTrackingRef.current.onProgress?.();
    }
  }, [
    listFromContext,
    listId,
    user?.id,
    flushPendingPlacesSnapshot,
    denyListAccess,
    accessRevokedRevision,
    confirmPrivateAccessFromServer,
    setAccessRevoked,
    listsLoading,
  ]);

  useEffect(() => {
    if (!listId || listFromContext) {
      return;
    }

    let cancelled = false;
    listAccessibleRef.current = false;
    loadTrackingRef.current.listLoaded = false;
    loadTrackingRef.current.hasCachedData = false;
    loadTrackingRef.current.onProgress?.();

    const unsubscribeList = ListService.subscribeToList(
      listId,
      (listData, meta) => {
        if (cancelled) return;
        if (!meta.fromCache && listData && !listData.isPublic) {
          privateListServerVerifiedRef.current = true;
        }
        if (
          listData &&
          !shouldTrustPrivateListSnapshot({
            fromCache: meta.fromCache,
            isPublic: listData.isPublic,
            serverVerified: privateListServerVerifiedRef.current,
          })
        ) {
          if (listId && user?.id && isBrowserOnline()) {
            confirmPrivateAccessFromServer(listId, user.id);
          }
          denyListAccess();
          setList(null);
          setPlaces([]);
          setError('List not found');
          loadTrackingRef.current.hasCachedData = false;
          loadTrackingRef.current.listLoaded = true;
          loadTrackingRef.current.onProgress?.();
          return;
        }
        if (
          !shouldGrantListAccess({
            list: listData,
            userId: user?.id,
            fromCache: meta.fromCache,
            accessRevoked: accessRevokedRef.current,
          })
        ) {
          denyListAccess();
          setList(null);
          setPlaces([]);
          setError('List not found');
          loadTrackingRef.current.hasCachedData = false;
          loadTrackingRef.current.listLoaded = true;
          loadTrackingRef.current.onProgress?.();
          return;
        }

        listAccessibleRef.current = true;
        flushPendingPlacesSnapshot();
        setList(listData);
        setError(listData ? null : 'List not found');
        loadTrackingRef.current.hasCachedData = !!listData;
        loadTrackingRef.current.listLoaded = true;
        loadTrackingRef.current.onProgress?.();
      },
      (err) => {
        if (cancelled) return;
        logger.error('Error listening to list:', err);
        denyListAccess();
        if (isFirestorePermissionDenied(err)) {
          setAccessRevoked(true);
          setList(null);
          setPlaces([]);
          setError('List not found');
        } else {
          setError(
            `Failed to load list data: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
        loadTrackingRef.current.hasCachedData = false;
        loadTrackingRef.current.listLoaded = true;
        loadTrackingRef.current.onProgress?.();
      }
    );

    return () => {
      cancelled = true;
      unsubscribeList();
    };
  }, [
    listId,
    listFromContext,
    user?.id,
    flushPendingPlacesSnapshot,
    denyListAccess,
    setAccessRevoked,
    confirmPrivateAccessFromServer,
  ]);

  useEffect(() => {
    if (!listId || !listAccessKey || !placeAccessQuery) {
      return;
    }

    let cancelled = false;
    const contextList = listsRef.current.find((entry) => entry.id === listId) ?? null;
    pendingPlacesSnapshotRef.current = undefined;
    applyPendingPlacesRef.current = null;
    if (
      contextList &&
      shouldHydrateCachedListSnapshot({
        list: contextList,
        userId: user?.id,
        accessRevoked: accessRevokedRef.current,
      })
    ) {
      listAccessibleRef.current = true;
      loadTrackingRef.current.listLoaded = true;
      loadTrackingRef.current.hasCachedData = true;
    }
    let listLoaded = loadTrackingRef.current.listLoaded;
    let placesLoaded = false;
    let hasCachedData = loadTrackingRef.current.hasCachedData;
    paginationCursorRef.current = null;
    extraPlacesRef.current = [];

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
      if (
        contextList &&
        shouldApplyCachedListDetails(listAccessibleRef.current, cancelled) &&
        shouldHydrateCachedListSnapshot({
          list: contextList,
          userId: user?.id,
          accessRevoked: accessRevokedRef.current,
        })
      ) {
        setList(contextList);
        setError(null);
        listLoaded = true;
        hasCachedData = true;
        finishLoading();
      }

      const [cachedList, cachedPlaces] = await Promise.all([
        contextList ? Promise.resolve(null) : ListService.getListFromCache(listId),
        PlaceService.getListPlacesFromCache(placeAccessQuery),
      ]);

      if (!shouldApplyCachedListDetails(listAccessibleRef.current, cancelled)) {
        return;
      }

      if (
        !contextList &&
        cachedList &&
        shouldGrantListAccess({
          list: cachedList,
          userId: user?.id,
          fromCache: true,
          accessRevoked: accessRevokedRef.current,
        })
      ) {
        setList(cachedList);
        setError(null);
        listLoaded = true;
        hasCachedData = true;
        finishLoading();
      }

      const listForPlacesAccess = contextList ?? cachedList ?? null;
      if (
        cachedPlaces &&
        shouldHydrateCachedListSnapshot({
          list: listForPlacesAccess,
          userId: user?.id,
          accessRevoked: accessRevokedRef.current,
        })
      ) {
        setPlaces(cachedPlaces);
        setHasMorePlaces(cachedPlaces.length >= PLACES_SUBSCRIPTION_LIMIT);
        placesLoaded = true;
        hasCachedData = true;
        setLoading(false);
        finishLoading();
        return;
      }

      setPlaces([]);
      setLoading(true);
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

    const applyPlacesSnapshot = (placesData: Place[]) => {
      const deduped = mergeSubscribedPlaces(placesData, extraPlacesRef.current);
      setPlaces(deduped);
      setHasMorePlaces(
        placesData.length >= PLACES_SUBSCRIPTION_LIMIT || paginationCursorRef.current !== null
      );
      placesLoaded = true;
      hasCachedData = hasCachedData || deduped.length > 0;
      finishLoading();
    };

    applyPendingPlacesRef.current = applyPlacesSnapshot;

    const unsubscribePlaces = subscribeToListPlacesShared(
      placeAccessQuery,
      (placesData) => {
        const resolution = resolvePlacesSnapshot({
          placesData,
          listAccessible: listAccessibleRef.current,
          cancelled,
          pendingSnapshot: pendingPlacesSnapshotRef.current,
        });
        pendingPlacesSnapshotRef.current = resolution.pendingSnapshot;
        if (!resolution.shouldApply) {
          return;
        }
        applyPlacesSnapshot(placesData);
      },
      (err) => {
        if (cancelled) return;
        if (isFirestorePermissionDenied(err)) {
          setAccessRevoked(true);
          denyListAccess();
          setPlaces([]);
          setError('List not found');
        } else {
          logger.error('Error listening to places:', err);
        }
        placesLoaded = true;
        finishLoading();
      }
    );

    if (loadTrackingRef.current.listLoaded) {
      flushPendingPlacesSnapshot();
    }

    return () => {
      cancelled = true;
      applyPendingPlacesRef.current = null;
      loadTrackingRef.current.onProgress = null;
      window.clearTimeout(timeoutId);
      unsubscribePlaces();
    };
    // Re-subscribe when access fields change, not on every list metadata update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- list metadata via listsRef; access via listAccessKey
  }, [listId, user?.id, listAccessKey, setAccessRevoked]);

  const loadMorePlaces = useCallback(async () => {
    if (!listId || loadingMore || !listAccessibleRef.current) return;

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

      if (!shouldApplyCachedListDetails(listAccessibleRef.current, false)) {
        return;
      }

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

  useEffect(() => {
    if (!loading || !listId) return;

    const timeoutId = window.setTimeout(() => {
      setError(
        (prev) =>
          prev ??
          (isBrowserOnline()
            ? 'Loading is taking longer than expected. Please try again.'
            : 'You appear to be offline. Reconnect to the internet to load this list.')
      );
      setLoading(false);
    }, 12000);

    return () => window.clearTimeout(timeoutId);
  }, [loading, listId]);

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
