import { auth } from '@/lib/firebase';
import type { Place } from '@/features/places/types/place';
import { getLocalDatabase } from '@/lib/localDb/database';
import { enqueueMutation, getPendingMutations } from '@/lib/localDb/mutationQueue';
import { deserializeRecord } from '@/lib/localDb/serialization';

/**
 * Re-queues status updates that exist in the local place cache but were dropped from
 * the mutation queue after a failed sync (e.g. permission-denied treated as missing doc).
 */
export async function requeueDriftedPlaceStatusMutations(): Promise<number> {
  const db = await getLocalDatabase();
  if (!db) {
    return 0;
  }

  const pending = await getPendingMutations();
  const pendingStatusIds = new Set(
    pending.filter((mutation) => mutation.type === 'updatePlaceStatus').map((m) => m.entityId)
  );

  const userId = auth.currentUser?.uid;
  const statement = db.prepare('SELECT data FROM places');
  let requeued = 0;

  while (statement.step()) {
    const row = statement.getAsObject() as { data?: string };
    if (typeof row.data !== 'string') {
      continue;
    }

    const place = deserializeRecord<Place>(row.data);
    if (!place.status || place.status === 'not_visited') {
      continue;
    }
    if (pendingStatusIds.has(place.id)) {
      continue;
    }

    await enqueueMutation({
      type: 'updatePlaceStatus',
      entityId: place.id,
      payload: {
        placeId: place.id,
        status: place.status,
        userId: place.updatedBy ?? userId,
        customValue: place.customStatus,
      },
    });
    requeued += 1;
  }

  statement.free();
  return requeued;
}
