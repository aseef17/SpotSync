import { useState, useMemo } from 'react';
import type { Place } from '@/features/places/types/place';
import type { FilterOptions } from '@/features/places/types/filters';
import { isPlaceOpen } from '@/features/places/utils/placeHelpers';
import {
  getDefaultPlaceFilters,
  getEmptyPlaceFilters,
} from '@/features/places/utils/defaultPlaceFilters';
import { toMilliseconds } from '@/utils/date';

type FilterScopeState = {
  scopeKey: string;
  filters: FilterOptions;
};

export const usePlaceFilters = (
  places: Place[],
  userLocation?: { lat: number; lng: number } | null,
  options?: { listId?: string; isPassportList?: boolean }
) => {
  const isPassportList = !!options?.isPassportList;
  const scopeKey = `${options?.listId ?? 'unknown'}:${isPassportList}`;

  const [filterScope, setFilterScope] = useState<FilterScopeState>(() => ({
    scopeKey,
    filters: getDefaultPlaceFilters(isPassportList),
  }));

  if (filterScope.scopeKey !== scopeKey) {
    setFilterScope({
      scopeKey,
      filters: getDefaultPlaceFilters(isPassportList),
    });
  }

  const filters = filterScope.filters;
  const setFilters = (next: FilterOptions | ((prev: FilterOptions) => FilterOptions)) => {
    setFilterScope((prev) => ({
      ...prev,
      filters: typeof next === 'function' ? next(prev.filters) : next,
    }));
  };

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

        const placeIsOpen = isPlaceOpen(place);
        if (query === 'open' && placeIsOpen) return true;
        if (query === 'closed' && !placeIsOpen) return true;

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

    // NYC Passport stamp filter
    if (filters.passportStamp) {
      const stampFilter = filters.passportStamp;
      if (Array.isArray(stampFilter)) {
        if (stampFilter.length > 0) {
          filtered = filtered.filter(
            (place) => place.passportStampId && stampFilter.includes(place.passportStampId)
          );
        }
      } else {
        filtered = filtered.filter((place) => place.passportStampId === stampFilter);
      }
    }

    // NYC Passport venue-type filter (replaces category for passport lists)
    if (filters.passportCategory) {
      const categoryFilter = filters.passportCategory;
      if (Array.isArray(categoryFilter)) {
        if (categoryFilter.length > 0) {
          filtered = filtered.filter(
            (place) =>
              place.passportCategory &&
              categoryFilter.some((c) => place.passportCategory?.toLowerCase() === c.toLowerCase())
          );
        }
      } else {
        filtered = filtered.filter(
          (place) => place.passportCategory?.toLowerCase() === categoryFilter.toLowerCase()
        );
      }
    }

    // NYC Passport: only places with a linked stamp
    if (filters.passportHasStamp) {
      filtered = filtered.filter((place) => Boolean(place.passportStampId));
    }

    // Open Now filter — use isPlaceOpen so filtering matches card UI (hours-first, not stale openNow)
    if (filters.openNow) {
      filtered = filtered.filter((place) => isPlaceOpen(place));
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

    const sortDirection = filters.sortDirection === 'asc' ? 1 : -1;

    const tieBreakById = (a: Place, b: Place, primary: number) =>
      primary !== 0 ? primary : a.id.localeCompare(b.id);

    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'name':
          return tieBreakById(a, b, sortDirection * a.name.localeCompare(b.name));
        case 'name-desc':
          return tieBreakById(a, b, -1 * a.name.localeCompare(b.name));
        case 'rating':
          return tieBreakById(a, b, sortDirection * ((a.rating || 0) - (b.rating || 0)));
        case 'price': {
          const levelA =
            typeof a.priceLevel === 'string' ? parsePriceLevel(a.priceLevel) : (a.priceLevel ?? -1);
          const levelB =
            typeof b.priceLevel === 'string' ? parsePriceLevel(b.priceLevel) : (b.priceLevel ?? -1);
          return tieBreakById(a, b, sortDirection * (levelA - levelB));
        }
        case 'distance': {
          if (!userLocation) return tieBreakById(a, b, 0);
          const distA = getDistance(userLocation, a.location);
          const distB = getDistance(userLocation, b.location);
          return tieBreakById(a, b, sortDirection * (distA - distB));
        }
        case 'date':
          return tieBreakById(
            a,
            b,
            sortDirection * (toMilliseconds(a.addedAt) - toMilliseconds(b.addedAt))
          );
        default:
          return tieBreakById(a, b, toMilliseconds(b.addedAt) - toMilliseconds(a.addedAt));
      }
    });

    return filtered;
  }, [places, filters, userLocation]);

  const clearFilters = () => setFilters(getEmptyPlaceFilters());

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
