import { useState, useCallback, useEffect } from 'react';
import { ListService } from '@/features/lists/api/listService';
import { PlaceService } from '@/features/places/api/placeService';
import { logger } from '@/utils/logger';
import type { PlaceList } from '@/features/lists/types/list';
import type { Place } from '@/features/places/types/place';

export const useListDetails = (listId: string | undefined) => {
  const [list, setList] = useState<PlaceList | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(!!listId);
  const [error, setError] = useState<string | null>(listId ? null : 'No list ID provided');
  const [activeListId, setActiveListId] = useState(listId);

  if (listId !== activeListId) {
    setActiveListId(listId);
    setList(null);
    setPlaces([]);
    setLoading(!!listId);
    setError(listId ? null : 'No list ID provided');
  }

  useEffect(() => {
    if (!listId) {
      return;
    }

    let cancelled = false;
    let listLoaded = false;
    let placesLoaded = false;

    const checkLoading = () => {
      if (!cancelled && listLoaded && placesLoaded) {
        setLoading(false);
      }
    };

    const unsubscribeList = ListService.subscribeToList(
      listId,
      (listData) => {
        if (cancelled) return;
        if (!listData) {
          setError('List not found');
        } else {
          setList(listData);
          setError(null);
        }
        listLoaded = true;
        checkLoading();
      },
      (err) => {
        if (cancelled) return;
        logger.error('Error listening to list:', err);
        setError(
          `Failed to load list data: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        listLoaded = true;
        checkLoading();
      }
    );

    const unsubscribePlaces = PlaceService.subscribeToListPlaces(
      listId,
      (placesData) => {
        if (cancelled) return;
        setPlaces(placesData);
        placesLoaded = true;
        checkLoading();
      },
      (err) => {
        if (cancelled) return;
        logger.error('Error listening to places:', err);
        placesLoaded = true;
        checkLoading();
      }
    );

    return () => {
      cancelled = true;
      unsubscribeList();
      unsubscribePlaces();
    };
  }, [listId]);

  const updateList = useCallback(
    async (listId: string, data: Partial<PlaceList>, userId?: string) => {
      try {
        await ListService.updateList(listId, data, userId);
      } catch (err) {
        logger.error('Error updating list:', err);
        throw err;
      }
    },
    []
  );

  return {
    list,
    places,
    loading,
    error,
    updateList,
  };
};
