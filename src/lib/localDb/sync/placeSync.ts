import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import { changeTopics, emitChange } from '@/lib/localDb/changeBus';
import { acquireSubscription } from '@/lib/localDb/subscriptionRegistry';
import { removeCachedPlace, upsertCachedPlace } from '@/lib/localDb/placeCache';
import { buildListPlacesQuery } from '@/features/places/api/placeFirestore';
import type { PlaceListAccessQuery } from '@/features/places/utils/placeAccess';

export async function shouldRemovePlaceAfterSnapshotRemoval(
  placeId: string,
  subscriptionLimit: number
): Promise<boolean> {
  if (subscriptionLimit <= 0) {
    return true;
  }

  const placeSnap = await getDoc(doc(db, 'places', placeId));
  return !placeSnap.exists();
}

function buildPlacesSyncKey(access: PlaceListAccessQuery, subscriptionLimit: number): string {
  return [
    'sync:places',
    access.listId,
    access.userId,
    access.ownerId,
    access.isPublic ? 'public' : 'private',
    subscriptionLimit,
  ].join(':');
}

async function applyPlaceDocChanges(
  listId: string,
  changes: Array<{
    type: 'added' | 'modified' | 'removed';
    placeId: string;
    place?: Parameters<typeof upsertCachedPlace>[0];
  }>,
  subscriptionLimit: number
): Promise<void> {
  for (const change of changes) {
    if (change.type === 'removed') {
      if (!(await shouldRemovePlaceAfterSnapshotRemoval(change.placeId, subscriptionLimit))) {
        continue;
      }

      await removeCachedPlace(change.placeId);
      emitChange(changeTopics.place(change.placeId));
      continue;
    }

    if (change.place) {
      await upsertCachedPlace(change.place);
      emitChange(changeTopics.place(change.placeId));
    }
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
    const q = buildListPlacesQuery(access, subscriptionLimit);

    return onSnapshot(
      q,
      (snapshot) => {
        void (async () => {
          try {
            const changes = snapshot.docChanges().map((change) => ({
              type: change.type,
              placeId: change.doc.id,
              place: change.type === 'removed' ? undefined : change.doc.data(),
            }));
            if (changes.length > 0) {
              await applyPlaceDocChanges(access.listId, changes, subscriptionLimit);
            }
            // Always notify so empty lists and first server snapshots resolve loading state.
            emitChange(changeTopics.placesForList(access.listId));
          } catch (error) {
            logger.error('Failed to apply place snapshot changes:', error);
          }
        })();
      },
      (error) => {
        logger.error('Place sync subscription error:', error);
      }
    );
  });
}
