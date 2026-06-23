import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseListPlaceMembershipDocId } from '@/features/places/constants/firestorePaths';
import { listPlaceMembershipDocRef } from '@/features/places/api/listPlaceMembershipFirestore';
import { findLegacyPassportMembershipId } from '@/features/places/utils/resolveWritableMembershipId';
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

type ListWriteAccess = 'write' | 'read' | 'none' | 'unknown';

async function readListWriteAccess(listId: string): Promise<ListWriteAccess> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    return 'unknown';
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
      return 'unknown';
    }
    throw error;
  }
}

function shouldDropForListAccess(access: ListWriteAccess): boolean {
  return access === 'read' || access === 'none';
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

async function canMigrateLegacyPassportMembership(membershipId: string): Promise<boolean> {
  const parsed = parseListPlaceMembershipDocId(membershipId);
  const listId = parsed?.listId;
  const googlePlaceId = parsed?.googlePlaceId;
  if (!listId || !googlePlaceId || googlePlaceId.startsWith('manual_passport_')) {
    return false;
  }

  const legacyMembershipId = await findLegacyPassportMembershipId(
    listId,
    googlePlaceId,
    membershipId
  );
  return legacyMembershipId !== null;
}

async function shouldDropUpdatePlaceStatus(
  mutation: PendingMutation,
  error: unknown
): Promise<boolean> {
  if (!isNotFoundError(error) && !isPermissionDeniedError(error)) {
    return false;
  }

  if (!auth.currentUser?.uid) {
    return false;
  }

  const payload = mutation.payload as UpdatePlaceStatusPayload;
  const membershipId = payload.placeId;
  const parsed = parseListPlaceMembershipDocId(membershipId);
  const listIdHint = parsed?.listId;

  if (isNotFoundError(error)) {
    if (await canMigrateLegacyPassportMembership(membershipId)) {
      return false;
    }
    return true;
  }

  try {
    const membershipSnap = await getDoc(listPlaceMembershipDocRef(membershipId));
    if (!membershipSnap.exists()) {
      if (await canMigrateLegacyPassportMembership(membershipId)) {
        return false;
      }
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
    return shouldDropForListAccess(access);
  } catch (membershipError) {
    if (!isPermissionDeniedError(membershipError)) {
      throw membershipError;
    }

    if (!listIdHint) {
      return false;
    }

    const access = await readListWriteAccess(listIdHint);
    return shouldDropForListAccess(access);
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
