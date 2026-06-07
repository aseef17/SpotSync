import { collection, doc, query, where, orderBy } from 'firebase/firestore';
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LIST_PLACES_COLLECTION } from '@/features/places/constants/firestorePaths';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import type { PlaceStatus } from '@/features/places/types/place';
import { omit } from '@/utils/objectUtils';

const VALID_STATUSES: PlaceStatus[] = ['not_visited', 'visited', 'not_going', 'custom'];

export const listPlaceMembershipConverter: FirestoreDataConverter<ListPlaceMembership> = {
  toFirestore(membership: ListPlaceMembership): DocumentData {
    return omit(membership, ['id']);
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): ListPlaceMembership {
    const data = snapshot.data(options);
    const status =
      typeof data.status === 'string' && VALID_STATUSES.includes(data.status as PlaceStatus)
        ? (data.status as PlaceStatus)
        : 'not_visited';

    return {
      ...data,
      id: snapshot.id,
      listId: typeof data.listId === 'string' ? data.listId : '',
      googlePlaceId: typeof data.googlePlaceId === 'string' ? data.googlePlaceId : '',
      status,
      addedAt: data.addedAt?.toDate ? data.addedAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    } as ListPlaceMembership;
  },
};

export function listPlaceMembershipDocRef(membershipId: string) {
  return doc(db, LIST_PLACES_COLLECTION, membershipId).withConverter(listPlaceMembershipConverter);
}

export function buildListPlaceMembershipsQuery(listId: string) {
  return query(
    collection(db, LIST_PLACES_COLLECTION).withConverter(listPlaceMembershipConverter),
    where('listId', '==', listId),
    orderBy('addedAt', 'desc')
  );
}
