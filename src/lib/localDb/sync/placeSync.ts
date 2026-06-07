import { getDoc, onSnapshot } from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { changeTopics, emitChange } from '@/lib/localDb/changeBus';
import { acquireSubscription } from '@/lib/localDb/subscriptionRegistry';
import { removeCachedPlace, upsertCachedPlace } from '@/lib/localDb/placeCache';
import {
  buildListPlaceMembershipsQuery,
  listPlaceMembershipDocRef,
} from '@/features/places/api/listPlaceMembershipFirestore';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import type { PlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import { resolvePlacesFromMemberships } from '@/lib/localDb/sync/placeViewFetch';

export async function shouldRemovePlaceAfterSnapshotRemoval(
  membershipId: string,
  subscriptionLimit: number
): Promise<boolean> {
  if (subscriptionLimit <= 0) {
    return true;
  }

  const membershipSnap = await getDoc(listPlaceMembershipDocRef(membershipId));
  return !membershipSnap.exists();
}

function buildPlacesSyncKey(access: PlaceListAccessQuery, subscriptionLimit: number): string {
  return [
    'sync:listPlaces',
    access.listId,
    access.userId,
    access.ownerId,
    access.isPublic ? 'public' : 'private',
    subscriptionLimit,
  ].join(':');
}

async function applyMembershipDocChanges(
  listId: string,
  changes: Array<{
    type: 'added' | 'modified' | 'removed';
    membershipId: string;
    membership?: ListPlaceMembership;
  }>,
  subscriptionLimit: number
): Promise<void> {
  const upsertMemberships = changes
    .filter((change) => change.type !== 'removed' && change.membership)
    .map((change) => change.membership!);

  if (upsertMemberships.length > 0) {
    const places = await resolvePlacesFromMemberships(upsertMemberships);
    for (const place of places) {
      await upsertCachedPlace(place);
      emitChange(changeTopics.place(place.id));
    }
  }

  for (const change of changes) {
    if (change.type !== 'removed') {
      continue;
    }

    if (!(await shouldRemovePlaceAfterSnapshotRemoval(change.membershipId, subscriptionLimit))) {
      continue;
    }

    await removeCachedPlace(change.membershipId);
    emitChange(changeTopics.place(change.membershipId));
  }

  if (changes.length > 0) {
    emitChange(changeTopics.placesForList(listId));
  }
}

export function acquireListPlacesSync(
  access: PlaceListAccessQuery,
  subscriptionLimit: number
): () => void {
  const key = buildPlacesSyncKey(access, subscriptionLimit);

  return acquireSubscription(key, () => {
    const q = buildListPlaceMembershipsQuery(access.listId, { subscriptionLimit });

    return onSnapshot(
      q,
      (snapshot) => {
        void (async () => {
          try {
            const changes = snapshot.docChanges().map((change) => ({
              type: change.type,
              membershipId: change.doc.id,
              membership: change.type === 'removed' ? undefined : change.doc.data(),
            }));
            if (changes.length > 0) {
              await applyMembershipDocChanges(access.listId, changes, subscriptionLimit);
            }
            // Always notify so empty lists and first server snapshots resolve loading state.
            emitChange(changeTopics.placesForList(access.listId));
          } catch (error) {
            logger.error('Failed to apply list place membership snapshot changes:', error);
          }
        })();
      },
      (error) => {
        logger.error('List place membership sync subscription error:', error);
      }
    );
  });
}
