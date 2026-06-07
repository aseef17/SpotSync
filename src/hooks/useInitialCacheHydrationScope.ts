import { useEffect, useMemo, useState } from 'react';
import { useInitialCacheHydrationContext } from '@/context/InitialCacheHydrationContext';
import { isInitialCacheHydrating } from '@/lib/localDb/initialCacheHydration';
import {
  getPhotoWarmInFlight,
  subscribePhotoWarmInFlight,
} from '@/lib/localDb/placePhotoCache';

export interface InitialCacheHydrationScopeOptions {
  isLoading: boolean;
  hasContent: boolean;
  hadCacheInitially: boolean | null;
  waitForPhotoWarm?: boolean;
}

export function useInitialCacheHydrationScope(
  scopeKey: string,
  options: InitialCacheHydrationScopeOptions
): void {
  const { setScopeHydrating } = useInitialCacheHydrationContext();
  const waitForPhotoWarm = options.waitForPhotoWarm ?? false;
  const [photoWarmInFlight, setPhotoWarmInFlight] = useState(getPhotoWarmInFlight);

  useEffect(() => {
    if (!waitForPhotoWarm) {
      return;
    }

    return subscribePhotoWarmInFlight(() => {
      setPhotoWarmInFlight(getPhotoWarmInFlight());
    });
  }, [waitForPhotoWarm]);

  const isHydrating = useMemo(
    () =>
      isInitialCacheHydrating({
        hadCacheInitially: options.hadCacheInitially,
        isLoading: options.isLoading,
        hasContent: options.hasContent,
        waitForPhotoWarm,
        photoWarmInFlight,
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
    setScopeHydrating(scopeKey, isHydrating);
    return () => {
      setScopeHydrating(scopeKey, false);
    };
  }, [scopeKey, isHydrating, setScopeHydrating]);
}
