import type { FilterOptions } from '@/features/places/types/filters';

export function getDefaultPlaceFilters(isPassportList: boolean): FilterOptions {
  if (isPassportList) {
    return { passportHasStamp: true, openNow: true };
  }
  return { openNow: true };
}

function isSet(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

export function hasNonDefaultPlaceFilters(
  filters: FilterOptions,
  isPassportList: boolean
): boolean {
  const defaults = getDefaultPlaceFilters(isPassportList);

  if (isSet(filters.searchQuery)) return true;
  if (isSet(filters.status)) return true;
  if (isSet(filters.category)) return true;
  if (isSet(filters.cuisine)) return true;
  if (isSet(filters.passportStamp)) return true;
  if (isSet(filters.passportCategory)) return true;
  if (isSet(filters.minRating)) return true;
  if (isSet(filters.maxRating)) return true;
  if (isSet(filters.priceLevel)) return true;
  if (filters.sortBy && filters.sortBy !== 'date') return true;
  if (filters.sortDirection && filters.sortDirection !== 'desc') return true;
  if (filters.location) return true;

  if (filters.openNow !== defaults.openNow) return true;
  if (filters.passportHasStamp !== defaults.passportHasStamp) return true;

  return false;
}

export function countNonDefaultPlaceFilters(
  filters: FilterOptions,
  isPassportList: boolean
): number {
  const defaults = getDefaultPlaceFilters(isPassportList);
  let count = 0;

  if (isSet(filters.status)) count++;
  if (isSet(filters.category)) count++;
  if (isSet(filters.cuisine)) count++;
  if (isSet(filters.passportStamp)) count++;
  if (isSet(filters.passportCategory)) count++;
  if (filters.priceLevel && filters.priceLevel.length > 0) count++;
  if (isSet(filters.minRating)) count++;
  if (filters.sortBy && filters.sortBy !== 'date') count++;
  if (filters.openNow !== defaults.openNow) count++;
  if (filters.passportHasStamp !== defaults.passportHasStamp) count++;

  return count;
}
