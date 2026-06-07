import { onSnapshot } from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { buildListPlaceMembershipsQuery } from '@/features/places/api/listPlaceMembershipFirestore';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import type { PlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import { acquireSubscription } from '@/lib/localDb/subscriptionRegistry';

export const LIST_PLACES_SUBSCRIPTION_LIMIT = 500;

function buildListPlaceMembershipsSyncKey(access: PlaceListAccessQuery): string {
  return [
    'sync:listPlaceMemberships',
    access.listId,
    access.userId,
    access.ownerId,
    access.isPublic ? 'public' : 'private',
  ].join(':');
}

export function acquireListPlaceMembershipsSync(
  access: PlaceListAccessQuery,
  onUpdate: (memberships: ListPlaceMembership[]) => void,
  onError: (error: Error) => void
): () => void {
  const key = buildListPlaceMembershipsSyncKey(access);

  return acquireSubscription(key, () => {
    const q = buildListPlaceMembershipsQuery(access.listId, {});

    return onSnapshot(
      q,
      (snapshot) => {
        try {
          const memberships = snapshot.docs.map((docSnap) => docSnap.data());
          onUpdate(memberships);
        } catch (error) {
          onError(
            error instanceof Error
              ? error
              : new Error('Failed to process list place membership snapshot')
          );
        }
      },
      (error) => {
        logger.error('List place membership sync subscription error:', error);
        onError(error);
      }
    );
  });
}
