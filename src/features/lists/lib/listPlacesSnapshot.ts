import type { Place } from '@/features/places/types/place';

export type PendingPlacesSnapshot = Place[] | undefined;

export function mergeSubscribedPlaces(placesData: Place[], extraPlaces: Place[]): Place[] {
  const merged = [...placesData, ...extraPlaces];
  const seen = new Set<string>();
  return merged.filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
}

export function resolvePlacesSnapshot(options: {
  placesData: Place[];
  listAccessible: boolean;
  cancelled: boolean;
  pendingSnapshot: PendingPlacesSnapshot;
}): { pendingSnapshot: PendingPlacesSnapshot; shouldApply: boolean } {
  if (options.cancelled) {
    return { pendingSnapshot: options.pendingSnapshot, shouldApply: false };
  }

  if (!options.listAccessible) {
    return { pendingSnapshot: options.placesData, shouldApply: false };
  }

  return { pendingSnapshot: undefined, shouldApply: true };
}
