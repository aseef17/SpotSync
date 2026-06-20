import { doc } from 'firebase/firestore';
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GOOGLE_PLACES_COLLECTION } from '@/features/places/constants/firestorePaths';
import type { GooglePlace } from '@/features/places/types/googlePlace';
import { omit, omitUndefined } from '@/utils/objectUtils';

export const googlePlaceConverter: FirestoreDataConverter<GooglePlace> = {
  toFirestore(googlePlace: GooglePlace): DocumentData {
    return omitUndefined(omit(googlePlace, ['googlePlaceId']));
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): GooglePlace {
    const data = snapshot.data(options);

    return {
      ...data,
      googlePlaceId: snapshot.id,
      name: typeof data.name === 'string' ? data.name : 'Unknown',
      address: typeof data.address === 'string' ? data.address : '',
      location: {
        lat: typeof data.location?.lat === 'number' ? data.location.lat : 0,
        lng: typeof data.location?.lng === 'number' ? data.location.lng : 0,
      },
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
      detailsFetchedAt: data.detailsFetchedAt?.toDate ? data.detailsFetchedAt.toDate() : undefined,
    } as GooglePlace;
  },
};

export function googlePlaceDocRef(googlePlaceId: string) {
  return doc(db, GOOGLE_PLACES_COLLECTION, googlePlaceId).withConverter(googlePlaceConverter);
}
