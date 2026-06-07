import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ListService } from '@/features/lists/api/listService';
import { listRepository } from '@/lib/localDb/repositories/listRepository';
import { changeTopics, subscribeToChanges } from '@/lib/localDb/changeBus';
import { getLocalDatabase, subscribeLocalDataChanges } from '@/lib/localDb';
import { prefetchListView } from '@/features/lists/lib/prefetchListView';
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
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';
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

    prefetchListView();
    void getLocalDatabase();

    let cancelled = false;
    let hasCachedData = false;

    setError(null);
    setIsOfflineView(!isBrowserOnline());

    const hydrateFromCache = async () => {
      const cachedLists = await listRepository.getForUser(userId);
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

    const handleUpdate = (updatedLists: PlaceList[]) => {
      if (cancelled) return;
      hasCachedData = updatedLists.length > 0;
      setLists(updatedLists);
      setLoading(false);
      setError(null);
      setIsOfflineView(!isBrowserOnline());
    };

    const handleError = (err: Error) => {
      if (cancelled) return;
      logger.error('Error in lists subscription:', err);
      if (!hasCachedData) {
        setError('Failed to load lists');
      }
      setLoading(false);
    };

    let unsubscribe = () => {};
    if (isDashboard) {
      unsubscribe = listRepository.subscribeToUserLists(userId, handleUpdate, handleError, {
        enableSync: true,
        includeProfileSync: true,
      });
    } else {
      const unsubscribeChanges = subscribeToChanges(changeTopics.userLists(userId), () => {
        void hydrateFromCache();
      });
      unsubscribe = unsubscribeChanges;
    }

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
  }, [userId, isDashboard]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    return subscribeLocalDataChanges(() => {
      void (async () => {
        const cachedLists = await listRepository.getForUser(userId);
        if (cachedLists.length > 0) {
          setLists(cachedLists);
          setLoading(false);
          setError(null);
        }
      })();
    });
  }, [userId]);

  useEffect(() => {
    if (!loading || !userId) return;

    const timeoutId = window.setTimeout(() => {
      setError(
        (prev) =>
          prev ??
          (isBrowserOnline()
            ? 'Loading is taking longer than expected. Please try again.'
            : 'You appear to be offline. Reconnect to the internet to load your lists.')
      );
      setLoading(false);
    }, 12000);

    return () => window.clearTimeout(timeoutId);
  }, [loading, userId]);

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

  const deleteList = useCallback(
    async (listId: string) => {
      try {
        await ListService.deleteList(listId, userId);
      } catch (err) {
        logger.error('Error deleting list:', err);
        throw err;
      }
    },
    [userId]
  );

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
