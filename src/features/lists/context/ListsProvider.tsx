import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ListService } from '@/features/lists/api/listService';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';
import type { PlaceList } from '@/features/lists/types/list';
import { ListsContext, type ListsContextValue } from '@/features/lists/context/ListsContext';

const OFFLINE_LOAD_TIMEOUT_MS = 8000;

interface ListsProviderProps {
  userId: string | undefined;
  children: React.ReactNode;
}

export const ListsProvider: React.FunctionComponent<ListsProviderProps> = ({
  userId,
  children,
}) => {
  const [lists, setLists] = useState<PlaceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineView, setIsOfflineView] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLists([]);
      setLoading(false);
      setIsOfflineView(false);
      return;
    }

    let cancelled = false;
    let hasCachedData = false;

    setError(null);
    setIsOfflineView(!isBrowserOnline());

    const hydrateFromCache = async () => {
      const cachedLists = await ListService.getUserListsFromCache(userId);
      if (cancelled || cachedLists.length === 0) {
        return;
      }

      hasCachedData = true;
      setLists(cachedLists);
      setLoading(false);
      setError(null);
    };

    void hydrateFromCache();

    const timeoutId = window.setTimeout(
      () => {
        if (!cancelled && !hasCachedData) {
          setLoading(false);
          if (!isBrowserOnline()) {
            setError('You appear to be offline and no cached lists were found.');
          }
        }
      },
      isBrowserOnline() ? OFFLINE_LOAD_TIMEOUT_MS : 3000
    );

    const unsubscribe = ListService.subscribeToUserLists(
      userId,
      (updatedLists) => {
        if (cancelled) return;
        hasCachedData = updatedLists.length > 0;
        setLists(updatedLists);
        setLoading(false);
        setError(null);
        setIsOfflineView(!isBrowserOnline());
      },
      (err) => {
        if (cancelled) return;
        logger.error('Error in lists subscription:', err);
        if (!hasCachedData) {
          setError('Failed to load lists');
        }
        setLoading(false);
      }
    );

    const handleOnline = () => setIsOfflineView(false);
    const handleOffline = () => setIsOfflineView(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, [userId]);

  const createList = useCallback(
    async (data: {
      name: string;
      description?: string;
      icon: string;
      color: string;
      iconSize: number;
      isPublic: boolean;
      email: string;
      username: string;
      clientId?: string;
    }): Promise<string | undefined> => {
      if (!userId) return undefined;
      setCreating(true);
      try {
        return await ListService.createList(
          userId,
          data.name,
          data.description,
          data.icon,
          data.color,
          data.iconSize,
          data.isPublic,
          data.email,
          data.username,
          data.clientId
        );
      } catch (err) {
        logger.error('Error creating list:', err);
        throw err;
      } finally {
        setCreating(false);
      }
    },
    [userId]
  );

  const updateList = useCallback(
    async (listId: string, data: Partial<PlaceList>, userId?: string) => {
      setCreating(true);
      try {
        await ListService.updateList(listId, data, userId);
      } catch (err) {
        logger.error('Error updating list:', err);
        throw err;
      } finally {
        setCreating(false);
      }
    },
    []
  );

  const deleteList = useCallback(async (listId: string) => {
    try {
      await ListService.deleteList(listId);
    } catch (err) {
      logger.error('Error deleting list:', err);
      throw err;
    }
  }, []);

  const value = useMemo<ListsContextValue>(
    () => ({
      lists,
      loading,
      creating,
      error,
      isOfflineView,
      createList,
      updateList,
      deleteList,
    }),
    [lists, loading, creating, error, isOfflineView, createList, updateList, deleteList]
  );

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
};
