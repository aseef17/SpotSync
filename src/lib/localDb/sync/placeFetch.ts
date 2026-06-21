import { getDocs } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Place } from '@/features/places/types/place';
import type { PlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import { buildListPlaceMembershipsQuery } from '@/features/places/api/listPlaceMembershipFirestore';
import { changeTopics, emitChange } from '@/lib/localDb/changeBus';
import { upsertCachedPlace } from '@/lib/localDb/placeCache';
import { fetchListPlaceMembershipByListAndGooglePlaceId } from '@/lib/localDb/sync/listPlaceMembershipFetch';
import { resolvePlacesFromMemberships } from '@/lib/localDb/sync/placeViewFetch';

async function cacheResolvedPlaces(listId: string, places: Place[]): Promise<void> {
  for (const place of places) {
    await upsertCachedPlace(place);
  }

  if (places.length > 0) {
    emitChange(changeTopics.placesForList(listId));
  }
}

export async function fetchPlacesPageFromFirestore(
  access: PlaceListAccessQuery,
  pageSize: number,
  cursor?: QueryDocumentSnapshot<DocumentData>
): Promise<{
  places: Place[];
  hasMore: boolean;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
}> {
  const q = buildListPlaceMembershipsQuery(access, {
    pageSize: pageSize + 1,
    cursor,
  });

  const querySnapshot = await getDocs(q);
  const docs = querySnapshot.docs;
  const hasMore = docs.length > pageSize;
  const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
  const memberships = pageDocs.map((docSnap) => docSnap.data());
  const places = await resolvePlacesFromMemberships(memberships);

  await cacheResolvedPlaces(access.listId, places);

  return {
    places,
    hasMore,
    lastDoc: pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null,
  };
}

export async function fetchDuplicatePlaceFromFirestore(
  listId: string,
  placeData: Partial<Place>
): Promise<Place | null> {
  let membership = null;

  if (placeData.googlePlaceId) {
    membership = await fetchListPlaceMembershipByListAndGooglePlaceId(
      listId,
      placeData.googlePlaceId
    );
  } else if (placeData.plusCode) {
    membership = await fetchListPlaceMembershipByListAndGooglePlaceId(
      listId,
      `plus_${placeData.plusCode}`
    );
  } else {
    return null;
  }

  if (!membership) {
    return null;
  }

  const [place] = await resolvePlacesFromMemberships([membership]);
  if (!place) {
    return null;
  }

  await upsertCachedPlace(place);
  emitChange(changeTopics.placesForList(listId));
  emitChange(changeTopics.place(place.id));
  return place;
}
