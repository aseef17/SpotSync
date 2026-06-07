import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AppLoadingScreen } from '@/components/Layout/AppLoadingScreen';
import { InitialCacheHydrationContext } from '@/context/InitialCacheHydrationContext';
import {
  INITIAL_CACHE_HYDRATION_COPY,
  resolveHydrationScopeKey,
} from '@/lib/localDb/initialCacheHydration';

export function InitialCacheHydrationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [hydratingScopes, setHydratingScopes] = useState<ReadonlySet<string>>(() => new Set());

  const setScopeHydrating = useCallback((scopeKey: string, isHydrating: boolean) => {
    setHydratingScopes((previous) => {
      const alreadyHydrating = previous.has(scopeKey);
      if (isHydrating === alreadyHydrating) {
        return previous;
      }

      const next = new Set(previous);
      if (isHydrating) {
        next.add(scopeKey);
      } else {
        next.delete(scopeKey);
      }
      return next;
    });
  }, []);

  const activeScopeKey = useMemo(
    () => resolveHydrationScopeKey(location.pathname),
    [location.pathname]
  );

  const showOverlay = activeScopeKey !== null && hydratingScopes.has(activeScopeKey);

  const value = useMemo(() => ({ setScopeHydrating }), [setScopeHydrating]);

  return (
    <InitialCacheHydrationContext.Provider value={value}>
      {children}
      {showOverlay ? (
        <div className="fixed inset-0 z-50">
          <AppLoadingScreen
            title={INITIAL_CACHE_HYDRATION_COPY.title}
            message={INITIAL_CACHE_HYDRATION_COPY.message}
            showRetry={false}
          />
        </div>
      ) : null}
    </InitialCacheHydrationContext.Provider>
  );
}
