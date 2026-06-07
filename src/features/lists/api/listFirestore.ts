import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  DocumentData,
} from 'firebase/firestore';
import type { PlaceList } from '@/features/lists/types/list';
import type { Place } from '@/features/places/types/place';
import { omit } from '@/utils/objectUtils';

export const listConverter: FirestoreDataConverter<PlaceList> = {
  toFirestore(list: PlaceList): DocumentData {
    return omit(list, ['id', 'places']);
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): PlaceList {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      ...data,
      places: [] as Place[],
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    } as PlaceList;
  },
};
