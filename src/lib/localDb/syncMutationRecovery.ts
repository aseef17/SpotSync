import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listPlaceMembershipDocRef } from '@/features/places/api/listPlaceMembershipFirestore';
import type { PendingMutation } from '@/lib/localDb/types';
import type { CreateListPayload, UpdatePlaceStatusPayload } from '@/lib/localDb/types';

export function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String(error.code) : '';
  return code === 'permission-denied';
}

/** Returns true when a failed mutation already landed on the server and can be dropped. */
export async function shouldDropStaleMutation(
  mutation: PendingMutation,
  error: unknown
): Promise<boolean> {
  if (!isPermissionDeniedError(error)) {
    return false;
  }

  switch (mutation.type) {
    case 'createList': {
      const payload = mutation.payload as CreateListPayload;
      const listSnap = await getDoc(doc(db, 'lists', payload.listId));
      return listSnap.exists();
    }
    case 'updatePlaceStatus': {
      const payload = mutation.payload as UpdatePlaceStatusPayload;
      const membershipSnap = await getDoc(listPlaceMembershipDocRef(payload.placeId));
      if (!membershipSnap.exists()) {
        return false;
      }

      const data = membershipSnap.data();
      if (data.status !== payload.status) {
        return false;
      }

      if (payload.status === 'custom') {
        return (data.customStatus ?? '') === (payload.customValue ?? '');
      }

      return true;
    }
    default:
      return false;
  }
}

export function formatSyncFailureDetail(
  result: {
    syncedCount: number;
    remainingCount: number;
    lastError?: unknown;
    lastFailedMutation?: { id: string; type: string };
  },
  getErrorMessage: (error: unknown) => string
): string {
  if (result.syncedCount > 0) {
    return `${result.syncedCount} synced, ${result.remainingCount} still waiting.`;
  }

  const mutationHint = result.lastFailedMutation
    ? `${result.lastFailedMutation.type} (${result.lastFailedMutation.id}): `
    : '';

  return `${mutationHint}${getErrorMessage(result.lastError)}`;
}
