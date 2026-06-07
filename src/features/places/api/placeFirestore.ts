import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Place, PlaceStatus } from '@/features/places/types/place';
import { omit } from '@/utils/objectUtils';
import type { PlaceListAccessQuery } from '@/features/places/utils/placeAccess';

export const PLACES_SUBSCRIPTION_LIMIT = 500;
export const PLACES_PAGE_SIZE = 100;

export const placeConverter: FirestoreDataConverter<Place> = {
  toFirestore(place: Place): DocumentData {
    return omit(place, ['id']);
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Place {
    const data = snapshot.data(options);

    const validStatuses: PlaceStatus[] = ['not_visited', 'visited', 'not_going', 'custom'];
    const status =
      typeof data.status === 'string' && validStatuses.includes(data.status as PlaceStatus)
        ? data.status
        : 'not_visited';

    return {
      ...data,
      id: snapshot.id,
      name: typeof data.name === 'string' ? data.name : 'Unknown',
      address: typeof data.address === 'string' ? data.address : '',
      status,
      addedAt: data.addedAt?.toDate ? data.addedAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    } as Place;
  },
};

export function buildListPlacesQuery(access: PlaceListAccessQuery, subscriptionLimit: number) {
  // Query by listId only so legacy places without denormalized access fields still load.
  // Firestore security rules enforce read access via canReadPlace() on each document.
  return query(
    collection(db, 'places').withConverter(placeConverter),
    where('listId', '==', access.listId),
    orderBy('addedAt', 'desc'),
    limit(subscriptionLimit)
  );
}
