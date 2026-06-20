import { collection, doc, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
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
import { omit, omitUndefined } from '@/utils/objectUtils';

const VALID_STATUSES: PlaceStatus[] = ['not_visited', 'visited', 'not_going', 'custom'];

export const listPlaceMembershipConverter: FirestoreDataConverter<ListPlaceMembership> = {
  toFirestore(membership: ListPlaceMembership): DocumentData {
    return omitUndefined(omit(membership, ['id']));
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

export interface ListPlaceMembershipsQueryOptions {
  subscriptionLimit?: number;
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData>;
}

export function buildListPlaceMembershipsQuery(
  listId: string,
  options?: ListPlaceMembershipsQueryOptions
) {
  const collectionRef = collection(db, LIST_PLACES_COLLECTION).withConverter(
    listPlaceMembershipConverter
  );
  const baseConstraints = [where('listId', '==', listId), orderBy('addedAt', 'desc')];

  if (options?.cursor && options.pageSize !== undefined && options.pageSize > 0) {
    return query(
      collectionRef,
      ...baseConstraints,
      startAfter(options.cursor),
      limit(options.pageSize)
    );
  }

  if (options?.cursor) {
    return query(collectionRef, ...baseConstraints, startAfter(options.cursor));
  }

  if (options?.pageSize !== undefined && options.pageSize > 0) {
    return query(collectionRef, ...baseConstraints, limit(options.pageSize));
  }

  if (options?.subscriptionLimit !== undefined && options.subscriptionLimit > 0) {
    return query(collectionRef, ...baseConstraints, limit(options.subscriptionLimit));
  }

  return query(collectionRef, ...baseConstraints);
}
