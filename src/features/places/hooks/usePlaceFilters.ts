import { useState, useMemo } from 'react';
import type { Place } from '@/features/places/types/place';
import type { FilterOptions } from '@/features/places/types/filters';

export const usePlaceFilters = (places: Place[]) => {
  const [filters, setFilters] = useState<FilterOptions>({});
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  
  const filteredPlaces = useMemo(() => {
    let filtered = [...places];

    // Search query filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (place) =>
          place.name.toLowerCase().includes(query) ||
          place.address.toLowerCase().includes(query) ||
          place.category?.toLowerCase().includes(query) ||
          place.notes?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (filters.status) {
      if (filters.status === 'custom' && filters.customStatus) {
        filtered = filtered.filter((place) => place.customStatus === filters.customStatus);
      } else {
        filtered = filtered.filter((place) => place.status === filters.status);
      }
    }

    // Category filter
    if (filters.category) {
      filtered = filtered.filter(
        (place) => place.category?.toLowerCase() === filters.category?.toLowerCase()
      );
    }

    // Cuisine filter
    if (filters.cuisine) {
      filtered = filtered.filter(
        (place) => place.cuisines?.some(c => c.toLowerCase() === filters.cuisine?.toLowerCase())
      );
    }

    // Open Now filter
    if (filters.openNow) {
      filtered = filtered.filter((place) => place.openNow === true);
    }

    // Rating filters
    if (filters.minRating !== undefined) {
      filtered = filtered.filter((place) => (place.rating || 0) >= filters.minRating!);
    }
    if (filters.maxRating !== undefined) {
      filtered = filtered.filter((place) => (place.rating || 0) <= filters.maxRating!);
    }

    // Price level filter
    if (filters.priceLevel !== undefined) {
      filtered = filtered.filter((place) => (place.priceLevel || 0) === filters.priceLevel!);
    }

    return filtered;
  }, [places, filters]);

  const clearFilters = () => setFilters({});

  return {
    filters,
    setFilters,
    filteredPlaces,
    viewMode,
    setViewMode,
    clearFilters
  };
};
