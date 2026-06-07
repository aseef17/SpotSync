import { listPlaceMembershipDocId } from '@/features/places/constants/firestorePaths';
import type { GooglePlace } from '@/features/places/types/googlePlace';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import type { Place } from '@/features/places/types/place';
import { getPrimaryPhotoUrl, trimPhotoUrlsForStorage } from '@/features/places/utils/placeAccess';

const MEMBERSHIP_UPDATE_KEYS = new Set([
  'status',
  'customStatus',
  'notes',
  'updatedBy',
  'updatedAt',
]);

const GOOGLE_PLACE_UPDATE_KEYS = new Set([
  'name',
  'address',
  'location',
  'plusCode',
  'category',
  'cuisines',
  'types',
  'rating',
  'userRatingsTotal',
  'priceLevel',
  'photoUrls',
  'thumbnailUrl',
  'photoCount',
  'googleMapsUrl',
  'openNow',
  'businessStatus',
  'phoneNumber',
  'website',
  'openingHours',
  'timeZone',
  'delivery',
  'dineIn',
  'takeout',
  'reservable',
  'servesBeer',
  'servesWine',
  'servesVegetarianFood',
  'wheelchairAccessible',
  'lat',
  'lng',
  'detailsFetchedAt',
]);

/** Strips Places API (New) resource prefix so IDs are safe Firestore document IDs. */
export function normalizeGooglePlaceId(googlePlaceId: string): string {
  return googlePlaceId.replace(/^places\//, '');
}

/** Resolves the canonical googlePlaces document ID for a new place. */
export function resolveCanonicalGooglePlaceId(
  placeData: Pick<Place, 'googlePlaceId' | 'plusCode'>
): string {
  if (placeData.googlePlaceId) {
    return normalizeGooglePlaceId(placeData.googlePlaceId);
  }
  if (placeData.plusCode) {
    return `plus_${placeData.plusCode}`;
  }
  return `manual_${crypto.randomUUID()}`;
}

export function resolveMembershipId(listId: string, googlePlaceId: string): string {
  return listPlaceMembershipDocId(listId, googlePlaceId);
}

/** Indexes of bulk-import rows that collide on the same list membership id. */
export function findDuplicateMembershipIndexes(
  listId: string,
  places: Array<Pick<Place, 'googlePlaceId' | 'plusCode'>>
): number[] {
  const seenMembershipIds = new Set<string>();
  const duplicateIndexes: number[] = [];

  places.forEach((place, index) => {
    const googlePlaceId = resolveCanonicalGooglePlaceId(place);
    const membershipId = resolveMembershipId(listId, googlePlaceId);
    if (seenMembershipIds.has(membershipId)) {
      duplicateIndexes.push(index);
      return;
    }
    seenMembershipIds.add(membershipId);
  });

  return duplicateIndexes;
}

export function splitPlaceUpdates(updates: Partial<Place>): {
  membershipUpdates: Partial<ListPlaceMembership>;
  googlePlaceUpdates: Partial<GooglePlace>;
} {
  const membershipUpdates: Partial<ListPlaceMembership> = {};
  const googlePlaceUpdates: Partial<GooglePlace> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }

    if (MEMBERSHIP_UPDATE_KEYS.has(key)) {
      (membershipUpdates as Record<string, unknown>)[key] = value;
    } else if (GOOGLE_PLACE_UPDATE_KEYS.has(key)) {
      (googlePlaceUpdates as Record<string, unknown>)[key] = value;
    }
  }

  return { membershipUpdates, googlePlaceUpdates };
}

export function buildGooglePlacePayload(
  place: Omit<Place, 'id'>,
  googlePlaceId: string,
  timestamps: { createdAt: Date; updatedAt: Date }
): GooglePlace {
  const trimmedPhotos = trimPhotoUrlsForStorage(place.photoUrls);
  const thumbnailUrl = place.thumbnailUrl ?? getPrimaryPhotoUrl(trimmedPhotos);

  return {
    googlePlaceId,
    name: place.name,
    address: place.address,
    location: place.location ?? { lat: place.lat ?? 0, lng: place.lng ?? 0 },
    plusCode: place.plusCode,
    category: place.category,
    cuisines: place.cuisines,
    types: place.types,
    rating: place.rating,
    userRatingsTotal: place.userRatingsTotal,
    priceLevel: place.priceLevel,
    photoUrls: trimmedPhotos,
    thumbnailUrl,
    photoCount: place.photoCount ?? trimmedPhotos?.length,
    googleMapsUrl: place.googleMapsUrl,
    openNow: place.openNow,
    businessStatus: place.businessStatus,
    phoneNumber: place.phoneNumber,
    website: place.website,
    openingHours: place.openingHours,
    timeZone: place.timeZone,
    delivery: place.delivery,
    dineIn: place.dineIn,
    takeout: place.takeout,
    reservable: place.reservable,
    servesBeer: place.servesBeer,
    servesWine: place.servesWine,
    servesVegetarianFood: place.servesVegetarianFood,
    wheelchairAccessible: place.wheelchairAccessible,
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  };
}

export function buildMembershipPayload(
  place: Omit<Place, 'id'>,
  listId: string,
  googlePlaceId: string,
  membershipId: string,
  timestamps: { addedAt: Date; updatedAt: Date }
): ListPlaceMembership {
  return {
    id: membershipId,
    listId,
    googlePlaceId,
    status: place.status ?? 'not_visited',
    customStatus: place.customStatus,
    notes: place.notes,
    addedBy: place.addedBy,
    addedAt: timestamps.addedAt,
    updatedAt: timestamps.updatedAt,
    updatedBy: place.updatedBy,
    ...(place.suppressNotifications ? { suppressNotifications: true } : {}),
  };
}
