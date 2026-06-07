import { useContext } from 'react';
import { InitialCacheHydrationContext } from '@/context/InitialCacheHydrationContext';

export function useInitialCacheHydration() {
  const context = useContext(InitialCacheHydrationContext);
  if (!context) {
    throw new Error('useInitialCacheHydration must be used within InitialCacheHydrationProvider');
  }
  return context;
}
