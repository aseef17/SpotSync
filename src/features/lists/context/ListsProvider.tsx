import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ListService } from '@/features/lists/api/listService';
import { logger } from '@/utils/logger';
import type { PlaceList } from '@/features/lists/types/list';

interface ListsContextValue {
  lists: PlaceList[];
  loading: boolean;
  creating: boolean;
  error: string | null;
  createList: (data: {
    name: string;
    description?: string;
    icon: string;
    color: string;
    iconSize: number;
    isPublic: boolean;
    email: string;
    username: string;
    clientId?: string;
  }) => Promise<string | undefined>;
  updateList: (listId: string, data: Partial<PlaceList>, userId?: string) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
}

const ListsContext = createContext<ListsContextValue | null>(null);

export const useListsContext = (): ListsContextValue => {
  const ctx = useContext(ListsContext);
  if (!ctx) {
    throw new Error('useListsContext must be used within a ListsProvider');
  }
  return ctx;
};

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

  const updateList = useCallback(async (listId: string, data: Partial<PlaceList>, userId?: string) => {
    setCreating(true);
    try {
      await ListService.updateList(listId, data, userId);
    } catch (err) {
      logger.error('Error updating list:', err);
      throw err;
    } finally {
      setCreating(false);
    }
  }, []);

  const deleteList = useCallback(async (listId: string) => {
    try {
      await ListService.deleteList(listId);
    } catch (err) {
      logger.error('Error deleting list:', err);
      throw err;
    }
  }, []);

  const value: ListsContextValue = {
    lists,
    loading,
    creating,
    error,
    createList,
    updateList,
    deleteList,
  };

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
};
