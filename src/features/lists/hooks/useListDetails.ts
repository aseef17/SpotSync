import { useState, useCallback, useEffect } from 'react';
import { ListService } from '@/features/lists/api/listService';
import { PlaceService } from '@/features/places/api/placeService';
import { logger } from '@/utils/logger';
import type { PlaceList } from '@/features/lists/types/list';
import type { Place } from '@/features/places/types/place';

export const useListDetails = (listId: string | undefined) => {
  const [list, setList] = useState<PlaceList | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadListData = useCallback(
    async (silent: boolean = false) => {
      try {
        if (!silent) {
          setLoading(true);
        }
        setError(null);

        if (!listId) {
          setError('No list ID provided');
          return;
        }

        const [listData, placesData] = await Promise.all([
          ListService.getList(listId),
          PlaceService.getListPlaces(listId),
        ]);

        if (!listData) {
          setError('List not found');
          return;
        }

        setList(listData);
        setPlaces(placesData);
      } catch (err) {
        logger.error('Error loading list data:', err);
        setError(
          `Failed to load list data: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [listId]
  );

  useEffect(() => {
    if (listId) {
      loadListData();
    }
  }, [listId, loadListData]);

  // Update a single place in the local state (optimistic update)
  const updatePlace = useCallback(
    async (placeId: string) => {
      try {
        const updatedPlace = await PlaceService.getPlace(placeId);
        if (updatedPlace) {
          setPlaces((prevPlaces) => prevPlaces.map((p) => (p.id === placeId ? updatedPlace : p)));
        }
      } catch (err) {
        logger.error('Error updating place:', err);
        // If update fails, reload all data
        loadListData();
      }
    },
    [loadListData]
  );

  const updateList = useCallback(
    async (listId: string, data: Partial<PlaceList>, userId?: string) => {
      try {
        await ListService.updateList(listId, data, userId);
        setList((prev) => (prev ? { ...prev, ...data } : null));
      } catch (err) {
        logger.error('Error updating list:', err);
        loadListData();
        throw err;
      }
    },
    [loadListData]
  );

  return {
    list,
    places,
    loading,
    error,
    loadListData,
    updatePlace,
    updateList,
  };
};
