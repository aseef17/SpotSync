import type { PlaceList, PassportConfig } from '@/features/lists/types/list';
import type { Place } from '@/features/places/types/place';
import { PASSPORT_STAMP_BY_ID, PASSPORT_STAMPS } from '@/features/passport/constants/stamps';

export function isPassportList(list: Pick<PlaceList, 'listKind'> | null | undefined): boolean {
  return list?.listKind === 'nyc_passport';
}

export function getPassportConfig(list: PlaceList | null | undefined): PassportConfig | undefined {
  if (!isPassportList(list)) return undefined;
  return list?.passportConfig;
}

export interface PassportProgress {
  /** Unique stamp designs collected (visited at least once). */
  uniqueStampsVisited: number;
  totalStampDesigns: number;
  /** Places with a stamp that are marked visited. */
  stampedPlacesVisited: number;
  stampedPlacesTotal: number;
  /** Places marked not going among stamped locations. */
  stampedPlacesSkipped: number;
  /** Stamp artist ids marked visited at least once. */
  visitedStampIds: string[];
}

export function computePassportProgress(places: Place[]): PassportProgress {
  const stampedPlaces = places.filter((p) => p.passportStampId);
  const visitedStampIds = new Set<string>();

  for (const place of stampedPlaces) {
    if (place.status === 'visited' && place.passportStampId) {
      visitedStampIds.add(place.passportStampId);
    }
  }

  return {
    uniqueStampsVisited: visitedStampIds.size,
    totalStampDesigns: PASSPORT_STAMPS.length,
    stampedPlacesVisited: stampedPlaces.filter((p) => p.status === 'visited').length,
    stampedPlacesTotal: stampedPlaces.length,
    stampedPlacesSkipped: stampedPlaces.filter((p) => p.status === 'not_going').length,
    visitedStampIds: [...visitedStampIds],
  };
}

export function getAvailablePassportStamps(places: Place[]): string[] {
  const ids = new Set<string>();
  for (const place of places) {
    if (place.passportStampId) {
      ids.add(place.passportStampId);
    }
  }
  return [...ids].sort((a, b) => {
    const nameA = PASSPORT_STAMP_BY_ID[a]?.name ?? a;
    const nameB = PASSPORT_STAMP_BY_ID[b]?.name ?? b;
    return nameA.localeCompare(nameB);
  });
}

export function getAvailablePassportCategories(places: Place[]): string[] {
  return [
    ...new Set(places.map((p) => p.passportCategory).filter((c): c is string => Boolean(c))),
  ].sort();
}
