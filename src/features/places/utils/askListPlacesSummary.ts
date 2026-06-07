import type { Place } from '@/features/places/types/place';

export type AskListPlaceSummary = {
  id: string;
  name: string;
  notes?: string;
  category?: string;
  status?: string;
  address?: string;
};

/** Only send a client summary when every place in the list is already loaded locally. */
export function buildAskListPlacesSummary(
  places: Place[],
  hasMorePlaces: boolean
): AskListPlaceSummary[] | undefined {
  if (hasMorePlaces) {
    return undefined;
  }

  return places.map((place) => ({
    id: place.id,
    name: place.name,
    notes: place.notes,
    category: place.category,
    status: place.status,
    address: place.address,
  }));
}
