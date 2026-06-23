import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseListPlaceMembershipDocId } from '@/features/places/constants/firestorePaths';
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

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String(error.code) : '';
  return code === 'not-found';
}

function userCanWriteList(
  list: { ownerId: string; editorIds?: string[] },
  userId: string
): boolean {
  if (list.ownerId === userId) {
    return true;
  }

  return (list.editorIds ?? []).includes(userId);
}

async function readListWriteAccess(listId: string): Promise<'write' | 'read' | 'none'> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    return 'none';
  }

  try {
    const listSnap = await getDoc(doc(db, 'lists', listId));
    if (!listSnap.exists()) {
      return 'none';
    }

    const data = listSnap.data() as {
      ownerId: string;
      editorIds?: string[];
      collaboratorIds?: string[];
      isPublic?: boolean;
    };

    if (userCanWriteList(data, userId)) {
      return 'write';
    }

    if (
      data.ownerId === userId ||
      data.collaboratorIds?.includes(userId) ||
      data.isPublic === true
    ) {
      return 'read';
    }

    return 'none';
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return 'none';
    }
    throw error;
  }
}

function placeStatusMatches(
  payload: UpdatePlaceStatusPayload,
  data: { status?: string; customStatus?: string | null }
): boolean {
  if (data.status !== payload.status) {
    return false;
  }

  if (payload.status === 'custom') {
    return (data.customStatus ?? '') === (payload.customValue ?? '');
  }

  return true;
}

async function shouldDropUpdatePlaceStatus(
  mutation: PendingMutation,
  error: unknown
): Promise<boolean> {
  if (isNotFoundError(error)) {
    return true;
  }

  if (!isPermissionDeniedError(error)) {
    return false;
  }

  // Auth may not be restored yet on cold start; dropping here would lose queued writes.
  if (!auth.currentUser?.uid) {
    return false;
  }

  const payload = mutation.payload as UpdatePlaceStatusPayload;
  const membershipId = payload.placeId;
  const parsed = parseListPlaceMembershipDocId(membershipId);
  const listIdHint = parsed?.listId;

  try {
    const membershipSnap = await getDoc(listPlaceMembershipDocRef(membershipId));
    if (!membershipSnap.exists()) {
      return true;
    }

    const data = membershipSnap.data();
    if (placeStatusMatches(payload, data)) {
      return true;
    }

    const listId = data.listId || listIdHint;
    if (!listId) {
      return false;
    }

    const access = await readListWriteAccess(listId);
    return access !== 'write';
  } catch (membershipError) {
    if (!isPermissionDeniedError(membershipError)) {
      throw membershipError;
    }

    if (!listIdHint) {
      return true;
    }

    const access = await readListWriteAccess(listIdHint);
    return access !== 'write';
  }
}

/** Returns true when a failed mutation already landed on the server and can be dropped. */
export async function shouldDropStaleMutation(
  mutation: PendingMutation,
  error: unknown
): Promise<boolean> {
  switch (mutation.type) {
    case 'createList': {
      if (!isPermissionDeniedError(error)) {
        return false;
      }

      const payload = mutation.payload as CreateListPayload;
      const listSnap = await getDoc(doc(db, 'lists', payload.listId));
      return listSnap.exists();
    }
    case 'updatePlaceStatus':
      return shouldDropUpdatePlaceStatus(mutation, error);
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
