import type { Place } from '@/features/places/types/place';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import type { PlaceListAccessFields, PlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import { resolvePlaceViews } from '@/features/places/utils/resolvePlaceView';
import { fetchGooglePlacesByIds, googlePlacesById } from '@/lib/localDb/sync/googlePlaceFetch';
import { fetchListPlaceMembershipsForList } from '@/lib/localDb/sync/listPlaceMembershipFetch';

export async function resolvePlacesFromMemberships(
  memberships: ListPlaceMembership[],
  accessFields?: PlaceListAccessFields
): Promise<Place[]> {
  if (memberships.length === 0) {
    return [];
  }

  const googlePlaces = await fetchGooglePlacesByIds(
    memberships.map((membership) => membership.googlePlaceId)
  );

  return resolvePlaceViews(memberships, googlePlacesById(googlePlaces), { accessFields });
}

export async function fetchPlaceViewsForList(
  access: PlaceListAccessQuery,
  accessFields?: PlaceListAccessFields
): Promise<Place[]> {
  const memberships = await fetchListPlaceMembershipsForList(access);
  return resolvePlacesFromMemberships(memberships, accessFields);
}
