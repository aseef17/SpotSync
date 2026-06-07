import { createContext } from 'react';

export interface InitialCacheHydrationContextValue {
  setScopeHydrating: (scopeKey: string, isHydrating: boolean) => void;
}

export const InitialCacheHydrationContext = createContext<InitialCacheHydrationContextValue | null>(
  null
);
