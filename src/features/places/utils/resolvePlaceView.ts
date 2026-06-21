import type { GooglePlace } from '@/features/places/types/googlePlace';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import type { Place } from '@/features/places/types/place';
import type { PlaceListAccessFields } from '@/features/places/utils/placeAccess';
import { normalizeOpeningHours } from '@/features/places/utils/openingHoursUtils';

export interface ResolvePlaceViewOptions {
  /** Denormalized list access fields until security rules no longer need them on Place. */
  accessFields?: PlaceListAccessFields;
  clientId?: string;
  isPreview?: boolean;
}

/**
 * Joins canonical Google metadata with per-list membership into the UI Place model.
 * Place.id is the composite membership document ID (`{listId}_{googlePlaceId}`).
 */
export function resolvePlaceView(
  googlePlace: GooglePlace,
  membership: ListPlaceMembership,
  options?: ResolvePlaceViewOptions
): Place {
  const { lat, lng } = googlePlace.location;

  return {
    id: membership.id,
    clientId: options?.clientId,
    listId: membership.listId,
    googlePlaceId: membership.googlePlaceId,
    name: googlePlace.name,
    address: googlePlace.address,
    location: googlePlace.location,
    lat,
    lng,
    plusCode: googlePlace.plusCode,
    category: googlePlace.category,
    cuisines: googlePlace.cuisines,
    types: googlePlace.types,
    rating: googlePlace.rating,
    userRatingsTotal: googlePlace.userRatingsTotal,
    priceLevel: googlePlace.priceLevel,
    photoUrls: googlePlace.photoUrls,
    thumbnailUrl: googlePlace.thumbnailUrl,
    photoCount: googlePlace.photoCount,
    googleMapsUrl: googlePlace.googleMapsUrl,
    openNow: googlePlace.openNow,
    businessStatus: googlePlace.businessStatus,
    phoneNumber: googlePlace.phoneNumber,
    website: googlePlace.website,
    openingHours: normalizeOpeningHours(googlePlace.openingHours),
    timeZone: googlePlace.timeZone,
    delivery: googlePlace.delivery,
    dineIn: googlePlace.dineIn,
    takeout: googlePlace.takeout,
    reservable: googlePlace.reservable,
    servesBeer: googlePlace.servesBeer,
    servesWine: googlePlace.servesWine,
    servesVegetarianFood: googlePlace.servesVegetarianFood,
    wheelchairAccessible: googlePlace.wheelchairAccessible,
    passportStampId: googlePlace.passportStampId,
    passportCategory: googlePlace.passportCategory,
    notes: membership.notes,
    status: membership.status,
    customStatus: membership.customStatus,
    addedBy: membership.addedBy,
    addedAt: membership.addedAt,
    updatedAt: membership.updatedAt,
    updatedBy: membership.updatedBy,
    listOwnerId: options?.accessFields?.listOwnerId,
    listIsPublic: options?.accessFields?.listIsPublic,
    listCollaboratorIds: options?.accessFields?.listCollaboratorIds,
    isPreview: options?.isPreview,
  };
}

/**
 * Resolves memberships that have a matching googlePlaces document.
 * Memberships without canonical metadata are omitted (caller may log separately).
 */
export function resolvePlaceViews(
  memberships: ListPlaceMembership[],
  googlePlacesById: Map<string, GooglePlace>,
  options?: ResolvePlaceViewOptions
): Place[] {
  const places: Place[] = [];

  for (const membership of memberships) {
    const googlePlace = googlePlacesById.get(membership.googlePlaceId);
    if (!googlePlace) {
      continue;
    }

    places.push(resolvePlaceView(googlePlace, membership, options));
  }

  return places;
}
