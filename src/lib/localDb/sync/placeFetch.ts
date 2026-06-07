import { collection, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { placeConverter } from '@/features/places/api/placeFirestore';
import type { Place } from '@/features/places/types/place';
import { changeTopics, emitChange } from '@/lib/localDb/changeBus';
import { upsertCachedPlace } from '@/lib/localDb/placeCache';

export async function fetchPlacesPageFromFirestore(
  listId: string,
  pageSize: number,
  cursor?: QueryDocumentSnapshot<DocumentData>
): Promise<{
  places: Place[];
  hasMore: boolean;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
}> {
  const baseConstraints = [where('listId', '==', listId), orderBy('addedAt', 'desc')];
  const q = cursor
    ? query(
        collection(db, 'places').withConverter(placeConverter),
        ...baseConstraints,
        startAfter(cursor),
        limit(pageSize + 1)
      )
    : query(
        collection(db, 'places').withConverter(placeConverter),
        ...baseConstraints,
        limit(pageSize + 1)
      );

  const querySnapshot = await getDocs(q);
  const docs = querySnapshot.docs;
  const hasMore = docs.length > pageSize;
  const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
  const places = pageDocs.map((docSnap) => docSnap.data());

  for (const place of places) {
    await upsertCachedPlace(place);
  }

  if (places.length > 0) {
    emitChange(changeTopics.placesForList(listId));
  }

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
  let q;

  if (placeData.plusCode) {
    q = query(
      collection(db, 'places').withConverter(placeConverter),
      where('listId', '==', listId),
      where('plusCode', '==', placeData.plusCode)
    );
  } else if (placeData.googlePlaceId) {
    q = query(
      collection(db, 'places').withConverter(placeConverter),
      where('listId', '==', listId),
      where('googlePlaceId', '==', placeData.googlePlaceId)
    );
  } else {
    return null;
  }

  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    return null;
  }

  const place = querySnapshot.docs[0].data();
  await upsertCachedPlace(place);
  emitChange(changeTopics.placesForList(listId));
  emitChange(changeTopics.place(place.id));
  return place;
}
