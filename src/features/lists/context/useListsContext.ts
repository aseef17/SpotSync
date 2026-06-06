import { useContext } from 'react';
import { ListsContext } from '@/features/lists/context/ListsContext';
import type { ListsContextValue } from '@/features/lists/context/ListsContext';

export const useListsContext = (): ListsContextValue => {
  const ctx = useContext(ListsContext);
  if (!ctx) {
    throw new Error('useListsContext must be used within a ListsProvider');
  }
  return ctx;
};
