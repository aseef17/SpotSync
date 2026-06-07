import { useEffect, useMemo, useRef, useState } from 'react';
import { useInitialCacheHydration } from '@/context/useInitialCacheHydration';
import {
  INITIAL_CACHE_HYDRATION_MAX_MS,
  isInitialCacheHydrating,
} from '@/lib/localDb/initialCacheHydration';
import {
  getPhotoWarmInFlightForList,
  subscribePhotoWarmInFlight,
} from '@/lib/localDb/placePhotoCache';

export interface InitialCacheHydrationScopeOptions {
  isLoading: boolean;
  hasContent: boolean;
  hadCacheInitially: boolean | null;
  waitForPhotoWarm?: boolean;
}

function resolveListIdFromScopeKey(scopeKey: string): string | null {
  if (!scopeKey.startsWith('list:')) {
    return null;
  }
  const listId = scopeKey.slice('list:'.length);
  return listId.length > 0 && listId !== 'unknown' ? listId : null;
}

export function useInitialCacheHydrationScope(
  scopeKey: string,
  options: InitialCacheHydrationScopeOptions
): void {
  const { setScopeHydrating } = useInitialCacheHydration();
  const waitForPhotoWarm = options.waitForPhotoWarm ?? false;
  const listIdForPhotoWarm = waitForPhotoWarm ? resolveListIdFromScopeKey(scopeKey) : null;
  const readPhotoWarmInFlight = () =>
    listIdForPhotoWarm ? getPhotoWarmInFlightForList(listIdForPhotoWarm) : 0;

  const [photoWarmInFlight, setPhotoWarmInFlight] = useState(readPhotoWarmInFlight);
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);
  const hydrationStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!waitForPhotoWarm) {
      return;
    }

    return subscribePhotoWarmInFlight(() => {
      setPhotoWarmInFlight(readPhotoWarmInFlight());
    });
  }, [waitForPhotoWarm, listIdForPhotoWarm]);

  const isHydrating = useMemo(
    () =>
      isInitialCacheHydrating({
        hadCacheInitially: options.hadCacheInitially,
        isLoading: options.isLoading,
        hasContent: options.hasContent,
        waitForPhotoWarm,
        photoWarmInFlight,
        forcedComplete: hydrationTimedOut,
      }),
    [
      options.hadCacheInitially,
      options.isLoading,
      options.hasContent,
      waitForPhotoWarm,
      photoWarmInFlight,
      hydrationTimedOut,
    ]
  );

  const shouldTrackHydrationTimeout = useMemo(
    () =>
      isInitialCacheHydrating({
        hadCacheInitially: options.hadCacheInitially,
        isLoading: options.isLoading,
        hasContent: options.hasContent,
        waitForPhotoWarm,
        photoWarmInFlight,
        forcedComplete: false,
      }),
    [
      options.hadCacheInitially,
      options.isLoading,
      options.hasContent,
      waitForPhotoWarm,
      photoWarmInFlight,
    ]
  );

  useEffect(() => {
    if (!shouldTrackHydrationTimeout) {
      hydrationStartedAtRef.current = null;
      return;
    }

    if (hydrationStartedAtRef.current === null) {
      hydrationStartedAtRef.current = Date.now();
    }
  }, [shouldTrackHydrationTimeout, scopeKey]);

  useEffect(() => {
    if (!shouldTrackHydrationTimeout || hydrationTimedOut) {
      return;
    }

    const startedAt = hydrationStartedAtRef.current ?? Date.now();
    const remainingMs = INITIAL_CACHE_HYDRATION_MAX_MS - (Date.now() - startedAt);
    const timeoutId = window.setTimeout(() => setHydrationTimedOut(true), Math.max(0, remainingMs));

    return () => window.clearTimeout(timeoutId);
  }, [shouldTrackHydrationTimeout, hydrationTimedOut, scopeKey]);

  useEffect(() => {
    if (shouldTrackHydrationTimeout) {
      return;
    }

    const timeoutId = window.setTimeout(() => setHydrationTimedOut(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [shouldTrackHydrationTimeout, scopeKey]);

  useEffect(() => {
    setScopeHydrating(scopeKey, isHydrating);
    return () => {
      setScopeHydrating(scopeKey, false);
    };
  }, [scopeKey, isHydrating, setScopeHydrating]);
}
