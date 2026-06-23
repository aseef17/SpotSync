import type { FilterOptions } from '@/features/places/types/filters';

export function getDefaultPlaceFilters(isPassportList: boolean): FilterOptions {
  if (isPassportList) {
    return { passportHasStamp: true, openNow: true };
  }
  return { openNow: true };
}

export function getEmptyPlaceFilters(): FilterOptions {
  return {};
}

function isSet(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

export function hasActivePlaceFilters(filters: FilterOptions): boolean {
  return countActivePlaceFilters(filters) > 0;
}

export function countActivePlaceFilters(filters: FilterOptions): number {
  let count = 0;

  if (filters.openNow) count++;
  if (filters.passportHasStamp) count++;
  if (isSet(filters.searchQuery)) count++;
  if (isSet(filters.status)) count++;
  if (isSet(filters.category)) count++;
  if (isSet(filters.cuisine)) count++;
  if (isSet(filters.passportStamp)) count++;
  if (isSet(filters.passportCategory)) count++;
  if (filters.priceLevel && filters.priceLevel.length > 0) count++;
  if (isSet(filters.minRating)) count++;
  if (isSet(filters.maxRating)) count++;
  if (filters.sortBy && filters.sortBy !== 'date') count++;
  if (filters.sortDirection && filters.sortDirection !== 'desc') count++;
  if (filters.location) count++;

  return count;
}
