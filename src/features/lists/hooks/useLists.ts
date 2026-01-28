import { useState, useCallback, useEffect } from 'react';
import { ListService } from '@/features/lists/api/listService';
import { logger } from '@/utils/logger';
import type { PlaceList } from '@/features/lists/types/list';

export const useLists = (userId: string | undefined) => {
  const [lists, setLists] = useState<PlaceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUserLists = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!userId) return;
    try {
      if (!options.silent) {
        setLoading(true);
      }
      const userLists = await ListService.getUserLists(userId);
      setLists(userLists);
      setError(null);
    } catch (err) {
      logger.error('Error loading lists:', err);
      setError('Failed to load lists');
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    loadUserLists();
  }, [loadUserLists]);

  const createList = async (data: {
    name: string;
    description?: string;
    icon: string;
    color: string;
    iconSize: number;
    isPublic: boolean;
    email: string;
    username: string;
  }) => {
    if (!userId) return;
    setCreating(true);
    try {
      await ListService.createList(
        userId,
        data.name,
        data.description,
        data.icon,
        data.color,
        data.iconSize,
        data.isPublic,
        data.email,
        data.username
      );
      await loadUserLists();
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
      await loadUserLists();
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
      await loadUserLists();
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
    deleteList
  };
};
