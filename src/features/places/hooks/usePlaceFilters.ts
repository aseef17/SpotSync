import { useState, useMemo } from 'react';
import type { Place } from '@/features/places/types/place';
import type { FilterOptions } from '@/features/places/types/filters';

export const usePlaceFilters = (
  places: Place[],
  userLocation?: { lat: number; lng: number } | null
) => {
  const [filters, setFilters] = useState<FilterOptions>({});
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const filteredPlaces = useMemo(() => {
    let filtered = [...places];

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((place) => {
        if (place.name.toLowerCase().includes(query)) return true;
        if (place.address.toLowerCase().includes(query)) return true;
        if (place.category?.toLowerCase().includes(query)) return true;
        if (place.notes?.toLowerCase().includes(query)) return true;

        if (place.cuisines?.some((c) => c.toLowerCase().includes(query))) return true;

        if (place.types?.some((t) => t.toLowerCase().includes(query))) return true;

        if (place.status?.toLowerCase().includes(query)) return true;
        if (place.customStatus?.toLowerCase().includes(query)) return true;

        if (query === 'open' && place.openNow === true) return true;
        if (query === 'closed' && place.openNow === false) return true;

        const priceTerms: Record<number, string[]> = {
          0: ['free'],
          1: ['cheap', 'inexpensive', '$', 'budget'],
          2: ['moderate', '$$', 'mid'],
          3: ['expensive', '$$$', 'pricey'],
          4: ['very expensive', '$$$$', 'luxury', 'fine dining'],
        };

        const placePriceLevel =
          typeof place.priceLevel === 'string'
            ? parsePriceLevel(place.priceLevel)
            : place.priceLevel;

        if (
          placePriceLevel !== undefined &&
          placePriceLevel !== null &&
          priceTerms[placePriceLevel]?.some((term) => term.includes(query))
        )
          return true;

        return false;
      });
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
      if (Array.isArray(filters.category)) {
        if (filters.category.length > 0) {
          filtered = filtered.filter((place) =>
            Array.isArray(filters.category)
              ? filters.category.some((c) => place.category?.toLowerCase() === c.toLowerCase())
              : false
          );
        }
      } else {
        filtered = filtered.filter(
          (place) => place.category?.toLowerCase() === (filters.category as string).toLowerCase()
        );
      }
    }

    // Cuisine filter
    if (filters.cuisine) {
      filtered = filtered.filter((place) =>
        place.cuisines?.some((c) => c.toLowerCase() === filters.cuisine?.toLowerCase())
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

    if (filters.priceLevel && filters.priceLevel.length > 0) {
      filtered = filtered.filter((place) => {
        const placeLevel =
          typeof place.priceLevel === 'string'
            ? parsePriceLevel(place.priceLevel)
            : place.priceLevel;

        if (placeLevel === null || placeLevel === undefined) return false;

        return filters.priceLevel?.includes(placeLevel);
      });
    }

    if (filters.sortBy) {
      filtered.sort((a, b) => {
        const direction = filters.sortDirection === 'desc' ? -1 : 1;

        switch (filters.sortBy) {
          case 'name':
            return direction * a.name.localeCompare(b.name);
          case 'name-desc':
            return -1 * a.name.localeCompare(b.name);
          case 'rating':
            return direction * ((a.rating || 0) - (b.rating || 0));
          case 'price': {
            const levelA =
              typeof a.priceLevel === 'string'
                ? parsePriceLevel(a.priceLevel)
                : (a.priceLevel ?? -1);
            const levelB =
              typeof b.priceLevel === 'string'
                ? parsePriceLevel(b.priceLevel)
                : (b.priceLevel ?? -1);
            return direction * (levelA - levelB);
          }
          case 'distance': {
            if (!userLocation) return 0;
            const distA = getDistance(userLocation, a.location);
            const distB = getDistance(userLocation, b.location);
            return direction * (distA - distB);
          }
          case 'date':
          default: {
            const toTime = (d: { seconds: number } | string | Date | null | undefined): number => {
              if (!d) return 0;
              if (typeof d === 'object' && 'seconds' in d) {
                return (d as { seconds: number }).seconds * 1000;
              }
              if (d instanceof Date) return d.getTime();
              return new Date(d).getTime();
            };
            const dateA = toTime(a.addedAt);
            const dateB = toTime(b.addedAt);
            return direction * (dateA - dateB);
          }
        }
      });
    }

    return filtered;
  }, [places, filters, userLocation]);

  const clearFilters = () => setFilters({});

  return {
    filters,
    setFilters,
    filteredPlaces,
    viewMode,
    setViewMode,
    clearFilters,
  };
};

// Haversine distance in meters
function getDistance(p1: { lat: number; lng: number }, p2?: { lat: number; lng: number }): number {
  if (!p2) return Infinity;
  const R = 6371e3; // metres
  const φ1 = (p1.lat * Math.PI) / 180;
  const φ2 = (p2.lat * Math.PI) / 180;
  const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
  const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

const parsePriceLevel = (level: string | number | null | undefined): number => {
  if (typeof level === 'number') return level;
  if (!level) return 0;

  switch (level) {
    case 'PRICE_LEVEL_FREE':
      return 0;
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 1;
    case 'PRICE_LEVEL_MODERATE':
      return 2;
    case 'PRICE_LEVEL_EXPENSIVE':
      return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 4;
    default:
      return 0; // Fallback
  }
};
