import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ListService } from '@/features/lists/api/listService';
import { listRepository } from '@/lib/localDb/repositories/listRepository';
import { placeRepository } from '@/lib/localDb/repositories/placeRepository';
import { PLACES_PAGE_SIZE, PLACES_SUBSCRIPTION_LIMIT } from '@/features/places/api/placeFirestore';
import { subscribeToListPlacesShared } from '@/features/places/api/placeListSubscriptionStore';
import { getPlaceListAccessKey, toPlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useListsContext } from '@/features/lists/context/useListsContext';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import {
  isFirestorePermissionDenied,
  readPersistedListAccessRevoked,
  readPersistedListSavedPrivateDenied,
  shouldClearStaleListView,
  shouldHydrateListFromPersistentCache,
  shouldTrustPrivateListSnapshot,
  writePersistedListAccessRevoked,
  writePersistedListSavedPrivateDenied,
} from '@/features/lists/hooks/listViewAccess';
import {
  resolveListFromContextAccess,
  shouldApplyCachedListDetails,
  shouldApplyContextListSnapshot,
  shouldApplyServerConfirmedPrivateAccess,
  shouldClearAccessRevokedOnContextReturn,
  shouldConfirmPrivateAccessFromTrustedContext,
  shouldConfirmSavedListAccessFromServer,
  shouldHydrateCachedListSnapshot,
} from '@/features/lists/lib/listDetailAccessGuard';
import { shouldGrantListAccess } from '@/features/lists/lib/listAccessFromSnapshot';
import {
  mergeSubscribedPlaces,
  resolvePlacesSnapshot,
  type PendingPlacesSnapshot,
} from '@/features/lists/lib/listPlacesSnapshot';
import { subscribeLocalDataChanges } from '@/lib/localDb';
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
  const [listLoading, setListLoading] = useState(() => !!listId && !listFromContext);
  const [placesLoading, setPlacesLoading] = useState(() => !!listId);
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
  const setSavedPrivateDenied = useCallback(
    (denied: boolean) => {
      savedPrivateDeniedRef.current = denied;
      writePersistedListSavedPrivateDenied(user?.id, listId, denied);
    },
    [listId, user?.id]
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
  }, [listId, user?.id, list]);

  const placeAccessQuery = useMemo(() => {
    if (!listId || !user?.id || !list) {
      return null;
    }
    return toPlaceListAccessQuery(listId, user.id, list);
  }, [listId, user?.id, list]);
  const loadTrackingRef = useRef({
    listLoaded: false,
    hasCachedData: false,
    onProgress: null as (() => void) | null,
  });
  const listAccessibleRef = useRef(true);
  const accessRevokedRef = useRef(false);
  const privateListServerVerifiedRef = useRef(false);
  const savedPrivateDeniedRef = useRef(false);
  const pendingPlacesSnapshotRef = useRef<PendingPlacesSnapshot>(undefined);
  const applyPendingPlacesRef = useRef<((placesData: Place[]) => void) | null>(null);
  const hadListFromContextRef = useRef(!!listFromContext);
  const placesPublishCountRef = useRef(0);
  const privateAccessConfirmKeyRef = useRef<string | null>(null);
  const listIdRef = useRef(listId);
  listIdRef.current = listId;

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

  const confirmPrivateAccessFromServer = useCallback(
    (targetListId: string, userId: string) => {
      void ListService.getListFromServer(targetListId)
        .then((confirmedList) => {
          if (
            !shouldApplyServerConfirmedPrivateAccess({
              targetListId,
              currentListId: listIdRef.current,
              confirmedList,
              userId,
            })
          ) {
            return;
          }
          privateListServerVerifiedRef.current = true;
          setAccessRevoked(false);
          setSavedPrivateDenied(false);
          listAccessibleRef.current = true;
          flushPendingPlacesSnapshot();
          setList(confirmedList);
          setError(null);
          loadTrackingRef.current.hasCachedData = true;
          loadTrackingRef.current.listLoaded = true;
          loadTrackingRef.current.onProgress?.();
        })
        .catch((err) => {
          privateAccessConfirmKeyRef.current = null;
          if (isFirestorePermissionDenied(err)) {
            setAccessRevoked(true);
            listAccessibleRef.current = false;
            clearPendingPlacesSnapshot();
            setList(null);
            setPlaces([]);
            setError('List not found');
            loadTrackingRef.current.hasCachedData = false;
            loadTrackingRef.current.listLoaded = true;
            loadTrackingRef.current.onProgress?.();
          }
        });
    },
    [setAccessRevoked, setSavedPrivateDenied, flushPendingPlacesSnapshot, clearPendingPlacesSnapshot]
  );

  useEffect(() => {
    hadListFromContextRef.current = false;
    privateAccessConfirmKeyRef.current = null;
    accessRevokedRef.current = readPersistedListAccessRevoked(user?.id, listId);
    privateListServerVerifiedRef.current = false;
    savedPrivateDeniedRef.current = readPersistedListSavedPrivateDenied(user?.id, listId);
    placesPublishCountRef.current = 0;
    const contextList = listId ? lists.find((entry) => entry.id === listId) : undefined;
    setListLoading(!!listId && !contextList);
    setPlacesLoading(!!listId);
  }, [listId, user?.id, lists]);

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
        (shouldConfirmPrivateAccessFromTrustedContext({
          list: listFromContext,
          userId: user.id,
          accessRevoked: accessRevokedRef.current,
          isOnline: isBrowserOnline(),
        }) ||
          shouldConfirmSavedListAccessFromServer({
            list: listFromContext,
            accessRevoked: accessRevokedRef.current,
            isOnline: isBrowserOnline(),
          }))
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
        if (contextAccess === 'deny-saved-private') {
          setSavedPrivateDenied(true);
        } else if (contextAccess === 'deny-no-access') {
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

      setSavedPrivateDenied(false);
      listAccessibleRef.current = true;
      flushPendingPlacesSnapshot();
      if (
        shouldApplyContextListSnapshot({
          listFromContext,
          serverVerifiedPrivateAccess: privateListServerVerifiedRef.current,
        })
      ) {
        setList(listFromContext);
      }
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
    setSavedPrivateDenied,
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

    const unsubscribeList = listRepository.subscribeToList(
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
            savedPrivateDenied: savedPrivateDeniedRef.current,
          })
        ) {
          if (!meta.fromCache) {
            denyListAccess();
            setList(null);
            setPlaces([]);
            setError('List not found');
            loadTrackingRef.current.hasCachedData = false;
            loadTrackingRef.current.listLoaded = true;
            loadTrackingRef.current.onProgress?.();
          }
          return;
        }

        if (!meta.fromCache) {
          setSavedPrivateDenied(false);
        }
        listAccessibleRef.current = true;
        flushPendingPlacesSnapshot();
        if (listData) {
          setList(listData);
          setError(null);
          loadTrackingRef.current.hasCachedData = true;
          loadTrackingRef.current.listLoaded = true;
          loadTrackingRef.current.onProgress?.();
          return;
        }

        if (!meta.fromCache) {
          denyListAccess();
          setList(null);
          setPlaces([]);
          setError('List not found');
          loadTrackingRef.current.hasCachedData = false;
          loadTrackingRef.current.listLoaded = true;
          loadTrackingRef.current.onProgress?.();
        }
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
    setSavedPrivateDenied,
  ]);

  useEffect(() => {
    if (!listId || !user?.id || listFromContext) {
      return;
    }

    const confirmKey = `${user.id}:${listId}`;
    if (privateAccessConfirmKeyRef.current === confirmKey) {
      return;
    }
    privateAccessConfirmKeyRef.current = confirmKey;
    confirmPrivateAccessFromServer(listId, user.id);
  }, [listId, user?.id, listFromContext, confirmPrivateAccessFromServer]);

  useEffect(() => {
    if (!listId || !listAccessKey || !placeAccessQuery) {
      return;
    }

    let cancelled = false;
    const loadTracking = loadTrackingRef.current;
    const contextList = listsRef.current.find((entry) => entry.id === listId) ?? null;
    pendingPlacesSnapshotRef.current = undefined;
    applyPendingPlacesRef.current = null;
    placesPublishCountRef.current = 0;
    if (
      contextList &&
      shouldHydrateCachedListSnapshot({
        list: contextList,
        userId: user?.id,
        accessRevoked: accessRevokedRef.current,
        savedPrivateDenied: savedPrivateDeniedRef.current,
      })
    ) {
      listAccessibleRef.current = true;
      loadTracking.listLoaded = true;
      loadTracking.hasCachedData = true;
    }
    let listLoaded = loadTracking.listLoaded;
    let placesLoaded = false;
    let hasCachedData = loadTracking.hasCachedData;
    paginationCursorRef.current = null;
    extraPlacesRef.current = [];

    const finishLoading = () => {
      if (cancelled) {
        return;
      }
      if (listLoaded) {
        setListLoading(false);
      }
      if (placesLoaded) {
        setPlacesLoading(false);
      }
    };

    loadTracking.onProgress = () => {
      listLoaded = loadTracking.listLoaded;
      hasCachedData = loadTracking.hasCachedData;
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
          savedPrivateDenied: savedPrivateDeniedRef.current,
        }) &&
        shouldApplyContextListSnapshot({
          listFromContext: contextList,
          serverVerifiedPrivateAccess: privateListServerVerifiedRef.current,
        })
      ) {
        setList(contextList);
        setError(null);
        listLoaded = true;
        hasCachedData = true;
        finishLoading();
      }

      const [cachedList, cachedPlaces] = await Promise.all([
        contextList ? Promise.resolve(null) : listRepository.getById(listId),
        placeRepository.getForList(placeAccessQuery.listId),
      ]);

      if (!shouldApplyCachedListDetails(listAccessibleRef.current, cancelled)) {
        return;
      }

      if (
        !contextList &&
        cachedList &&
        shouldHydrateListFromPersistentCache({
          grantFromAccessRules: shouldGrantListAccess({
            list: cachedList,
            userId: user?.id,
            fromCache: true,
            accessRevoked: accessRevokedRef.current,
            savedPrivateDenied: savedPrivateDeniedRef.current,
          }),
          isPublic: cachedList.isPublic,
          serverVerified: privateListServerVerifiedRef.current,
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
        cachedPlaces.length > 0 &&
        shouldHydrateCachedListSnapshot({
          list: listForPlacesAccess,
          userId: user?.id,
          accessRevoked: accessRevokedRef.current,
          savedPrivateDenied: savedPrivateDeniedRef.current,
        })
      ) {
        setPlaces(cachedPlaces);
        setHasMorePlaces(cachedPlaces.length >= PLACES_SUBSCRIPTION_LIMIT);
        placesLoaded = true;
        hasCachedData = true;
        setPlacesLoading(false);
        finishLoading();
      }
    };

    void hydrateFromCache();

    const timeoutId = window.setTimeout(
      () => {
        if (cancelled || hasCachedData || loadTrackingRef.current.hasCachedData) {
          return;
        }
        if (!loadTrackingRef.current.listLoaded) {
          setListLoading(false);
          setPlacesLoading(false);
          if (!isBrowserOnline()) {
            setError('You appear to be offline and no cached data was found for this list.');
          } else {
            setError('Loading is taking longer than expected. Please check your connection.');
          }
          return;
        }
        setPlacesLoading(false);
      },
      isBrowserOnline() ? OFFLINE_LOAD_TIMEOUT_MS : 3000
    );

    const applyPlacesSnapshot = (placesData: Place[]) => {
      placesPublishCountRef.current += 1;
      const isInitialEmptyCacheRead =
        placesPublishCountRef.current === 1 && placesData.length === 0;

      if (isInitialEmptyCacheRead) {
        return;
      }

      const deduped = mergeSubscribedPlaces(placesData, extraPlacesRef.current);
      setPlaces(deduped);
      setHasMorePlaces(
        placesData.length >= PLACES_SUBSCRIPTION_LIMIT || paginationCursorRef.current !== null
      );
      setError(null);
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
      loadTracking.onProgress = null;
      window.clearTimeout(timeoutId);
      unsubscribePlaces();
    };
    // Re-subscribe when access fields change, not on every list metadata update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- list metadata via listsRef; access via listAccessKey
  }, [listId, user?.id, listAccessKey, setAccessRevoked]);

  useEffect(() => {
    if (!listId) {
      return;
    }

    let readGeneration = 0;

    return subscribeLocalDataChanges(() => {
      const generation = ++readGeneration;

      void (async () => {
        if (!listAccessibleRef.current) {
          return;
        }

        const cachedPlaces = await placeRepository.getForList(listId);
        if (generation !== readGeneration) {
          return;
        }

        setPlaces(mergeSubscribedPlaces(cachedPlaces, extraPlacesRef.current));
      })();
    });
  }, [listId]);

  const loadMorePlaces = useCallback(async () => {
    if (!placeAccessQuery || loadingMore || !listAccessibleRef.current) return;

    setLoadingMore(true);
    try {
      if (!paginationCursorRef.current) {
        const initialPage = await placeRepository.fetchPage(
          placeAccessQuery,
          PLACES_SUBSCRIPTION_LIMIT
        );
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

      const page = await placeRepository.fetchPage(placeAccessQuery, PLACES_PAGE_SIZE, cursor);

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
  }, [placeAccessQuery, loadingMore]);

  useEffect(() => {
    if ((!listLoading && !placesLoading) || !listId) return;

    const timeoutId = window.setTimeout(() => {
      const listReady = loadTrackingRef.current.listLoaded;
      if (!listReady) {
        setError(
          (prev) =>
            prev ??
            (isBrowserOnline()
              ? 'Loading is taking longer than expected. Please try again.'
              : 'You appear to be offline. Reconnect to the internet to load this list.')
        );
      } else {
        setError((prev) => {
          if (
            prev?.includes('longer than expected') ||
            prev?.includes('offline') ||
            prev?.includes('Failed to load')
          ) {
            return null;
          }
          return prev;
        });
      }
      setListLoading(false);
      setPlacesLoading(false);
    }, 12000);

    return () => window.clearTimeout(timeoutId);
  }, [listLoading, placesLoading, listId]);

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
    loading: listLoading,
    placesLoading,
    error,
    updateList,
    hasMorePlaces,
    loadingMore,
    loadMorePlaces,
  };
};
