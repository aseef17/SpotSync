import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AppLoadingScreen } from '@/components/Layout/AppLoadingScreen';
import {
  INITIAL_CACHE_HYDRATION_COPY,
  resolveHydrationScopeKey,
} from '@/lib/localDb/initialCacheHydration';

interface InitialCacheHydrationContextValue {
  setScopeHydrating: (scopeKey: string, isHydrating: boolean) => void;
}

const InitialCacheHydrationContext = createContext<InitialCacheHydrationContextValue | null>(
  null
);

export function InitialCacheHydrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const location = useLocation();
  const { listId } = useParams();
  const scopeHydratingRef = useRef(new Map<string, boolean>());
  const [revision, setRevision] = useState(0);

  const setScopeHydrating = useCallback((scopeKey: string, isHydrating: boolean) => {
    const previous = scopeHydratingRef.current.get(scopeKey) ?? false;
    if (previous === isHydrating) {
      return;
    }

    if (isHydrating) {
      scopeHydratingRef.current.set(scopeKey, true);
    } else {
      scopeHydratingRef.current.delete(scopeKey);
    }

    setRevision((value) => value + 1);
  }, []);

  const activeScopeKey = useMemo(
    () => resolveHydrationScopeKey(location.pathname, listId),
    [location.pathname, listId]
  );

  const showOverlay =
    activeScopeKey !== null &&
    (scopeHydratingRef.current.get(activeScopeKey) ?? false);

  const value = useMemo(() => ({ setScopeHydrating }), [setScopeHydrating]);

  void revision;

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

export function useInitialCacheHydrationContext(): InitialCacheHydrationContextValue {
  const context = useContext(InitialCacheHydrationContext);
  if (!context) {
    throw new Error(
      'useInitialCacheHydrationContext must be used within InitialCacheHydrationProvider'
    );
  }
  return context;
}
