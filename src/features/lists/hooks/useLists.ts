import { useState, useCallback, useEffect } from 'react';
import { ListService } from '@/features/lists/api/listService';
import { logger } from '@/utils/logger';
import type { PlaceList } from '@/features/lists/types/list';

export const useLists = (userId: string | undefined) => {
  const [lists, setLists] = useState<PlaceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUserLists = useCallback(async () => {
    // Legacy stub: no longer needed because of real-time subscriptions,
    // but kept to prevent breaking child components that pass it to modals.
    return Promise.resolve();
  }, []);

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

  const createList = async (data: {
    name: string;
    description?: string;
    icon: string;
    color: string;
    iconSize: number;
    isPublic: boolean;
    email: string;
    username: string;
    clientId?: string;
  }) => {
    if (!userId) return;
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
  };

  const updateList = async (listId: string, data: Partial<PlaceList>, userId?: string) => {
    setCreating(true);
    try {
      await ListService.updateList(listId, data, userId);
    } catch (err) {
      logger.error('Error updating list:', err);
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const deleteList = async (listId: string) => {
    try {
      await ListService.deleteList(listId);
    } catch (err) {
      logger.error('Error deleting list:', err);
      throw err;
    }
  };

  return {
    lists,
    loading,
    creating,
    error,
    loadUserLists,
    createList,
    updateList,
    deleteList,
  };
};
