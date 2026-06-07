import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ListService } from '@/features/lists/api/listService';
import { logger } from '@/utils/logger';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import type { PlaceList } from '@/features/lists/types/list';
import { ListsContext, type ListsContextValue } from '@/features/lists/context/ListsContext';

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

  useEffect(() => {
    if (!userId) {
      setLists([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = ListService.subscribeToUserLists(
      userId,
      (updatedLists) => {
        setLists(updatedLists);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logger.error('Error in lists subscription:', err);
        setError('Failed to load lists');
        setLoading(false);
      }
    );

    return () => unsubscribe();
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
      createList,
      updateList,
      deleteList,
    }),
    [lists, loading, creating, error, createList, updateList, deleteList]
  );

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
};
