import { useState, useEffect, useCallback } from 'react';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import type { Place } from '@/features/places/types/place';
import type { LegacyGooglePlace } from '@/features/places/api/googleMapsService';

interface UseMapSearchProps {
  listId: string;
  userLocation: { lat: number; lng: number } | null;
  currentUserId?: string;
}

export const useMapSearch = ({ listId, userLocation, currentUserId }: UseMapSearchProps) => {
  const [isMapSearching, setIsMapSearching] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [debouncedMapSearchQuery, setDebouncedMapSearchQuery] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<LegacyGooglePlace[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMapSearchQuery(mapSearchQuery);
    }, 1200);

    return () => clearTimeout(timer);
  }, [mapSearchQuery]);

  const performMapSearch = useCallback(async (query: string) => {
    setIsSearchLoading(true);
    try {
      const results = await GoogleMapsService.searchPlaces(query, userLocation || undefined);
      setMapSearchResults(results);
    } catch (err) {
      console.error('Map search failed:', err);
    } finally {
      setIsSearchLoading(false);
    }
  }, [userLocation]);

  useEffect(() => {
    if (debouncedMapSearchQuery.trim().length >= 3) {
      performMapSearch(debouncedMapSearchQuery);
    } else {
      setMapSearchResults([]);
    }
  }, [debouncedMapSearchQuery, performMapSearch]);

  const handleSelectSearchResult = async (result: LegacyGooglePlace) => {
    setIsSearchLoading(true);
    try {
      const details = await GoogleMapsService.getPlaceDetails(result.place_id);
      if (details) {
        const place = GoogleMapsService.convertGooglePlaceToPlace(details, listId);
        const previewPlace: Place & { isPreview: boolean } = {
          ...place,
          id: `temp-${result.place_id}`,
          addedBy: currentUserId || '',
          addedAt: new Date(),
          updatedAt: new Date(),
          status: 'not_visited',
          isPreview: true,
        };
        return previewPlace;
      }
    } catch (err) {
      console.error('Failed to get search result details:', err);
    } finally {
      setIsSearchLoading(false);
    }
    return null;
  };

  const clearSearch = () => {
    setMapSearchQuery('');
    setMapSearchResults([]);
    setIsMapSearching(false);
  };

  return {
    isMapSearching,
    setIsMapSearching,
    mapSearchQuery,
    setMapSearchQuery,
    mapSearchResults,
    isSearchLoading,
    handleSelectSearchResult,
    clearSearch,
    debouncedMapSearchQuery
  };
};
