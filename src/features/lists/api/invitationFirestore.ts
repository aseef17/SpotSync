import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from 'firebase/firestore';
import type { Invitation } from '@/features/lists/types/invitation';
import { omit } from '@/utils/objectUtils';

export const invitationConverter: FirestoreDataConverter<Invitation> = {
  toFirestore(invitation: Invitation): DocumentData {
    return omit(invitation, ['id']);
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): Invitation {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
      expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt),
    } as Invitation;
  },
};
