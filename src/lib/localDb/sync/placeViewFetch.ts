import type { Place } from '@/features/places/types/place';
import type { PlaceListAccessFields } from '@/features/places/utils/placeAccess';
import { resolvePlaceViews } from '@/features/places/utils/resolvePlaceView';
import { fetchGooglePlacesByIds, googlePlacesById } from '@/lib/localDb/sync/googlePlaceFetch';
import { fetchListPlaceMembershipsForList } from '@/lib/localDb/sync/listPlaceMembershipFetch';

export async function fetchPlaceViewsForList(
  listId: string,
  accessFields?: PlaceListAccessFields
): Promise<Place[]> {
  const memberships = await fetchListPlaceMembershipsForList(listId);
  if (memberships.length === 0) {
    return [];
  }

  const googlePlaces = await fetchGooglePlacesByIds(
    memberships.map((membership) => membership.googlePlaceId)
  );

  return resolvePlaceViews(memberships, googlePlacesById(googlePlaces), { accessFields });
}
