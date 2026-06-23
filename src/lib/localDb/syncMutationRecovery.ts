import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseListPlaceMembershipDocId } from '@/features/places/constants/firestorePaths';
import { listPlaceMembershipDocRef } from '@/features/places/api/listPlaceMembershipFirestore';
import { findLegacyPassportMembershipId } from '@/features/places/utils/resolveWritableMembershipId';
import {
  isFirestorePermissionDenied,
  safeGetMembershipDoc,
} from '@/features/places/utils/safeMembershipGetDoc';
import type { PendingMutation } from '@/lib/localDb/types';
import type { CreateListPayload, UpdatePlaceStatusPayload } from '@/lib/localDb/types';
import { syncDebug } from '@/utils/syncDebug';

export function isPermissionDeniedError(error: unknown): boolean {
  return isFirestorePermissionDenied(error);
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

type ListAccessInfo = {
  access: ListWriteAccess;
  placeIds?: string[];
};

function listAccessFromSnapshot(
  listSnap: { exists: () => boolean; data: () => Record<string, unknown> | undefined },
  userId: string
): ListAccessInfo {
  if (!listSnap.exists()) {
    return { access: 'none' };
  }

  const data = listSnap.data() as {
    ownerId: string;
    editorIds?: string[];
    collaboratorIds?: string[];
    isPublic?: boolean;
    placeIds?: string[];
  };

  if (userCanWriteList(data, userId)) {
    return { access: 'write', placeIds: data.placeIds };
  }

  if (data.ownerId === userId || data.collaboratorIds?.includes(userId) || data.isPublic === true) {
    return { access: 'read', placeIds: data.placeIds };
  }

  return { access: 'none', placeIds: data.placeIds };
}

async function readListAccessInfo(listId: string): Promise<ListAccessInfo> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    return { access: 'unknown' };
  }

  try {
    const listSnap = await getDoc(doc(db, 'lists', listId));
    return listAccessFromSnapshot(listSnap, userId);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return { access: 'unknown' };
    }
    throw error;
  }
}

async function readListWriteAccess(listId: string): Promise<ListWriteAccess> {
  const listAccess = await readListAccessInfo(listId);
  return listAccess.access;
}

function shouldDropForListAccess(access: ListWriteAccess): boolean {
  return access === 'read' || access === 'none';
}

function isGooglePlaceIdLinkedToList(
  placeIds: string[] | undefined,
  googlePlaceId: string
): boolean {
  return Array.isArray(placeIds) && placeIds.includes(googlePlaceId);
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
    const canMigrate = await canMigrateLegacyPassportMembership(membershipId);
    syncDebug('stale-updatePlaceStatus-not-found', { membershipId, canMigrate });
    if (canMigrate) {
      if (listIdHint) {
        const access = await readListWriteAccess(listIdHint);
        syncDebug('stale-updatePlaceStatus-not-found-list-access', {
          membershipId,
          listIdHint,
          access,
        });
        if (shouldDropForListAccess(access)) {
          return true;
        }
      }
      return false;
    }
    return true;
  }

  try {
    const membershipSnap = await safeGetMembershipDoc(
      listPlaceMembershipDocRef(membershipId),
      'stale-updatePlaceStatus-membership',
      { membershipId }
    );
    if (!membershipSnap.exists()) {
      const canMigrate = await canMigrateLegacyPassportMembership(membershipId);
      syncDebug('stale-updatePlaceStatus-missing-doc', { membershipId, canMigrate });
      if (canMigrate) {
        if (listIdHint) {
          const access = await readListWriteAccess(listIdHint);
          syncDebug('stale-updatePlaceStatus-migrate-list-access', {
            membershipId,
            listIdHint,
            access,
          });
          if (shouldDropForListAccess(access)) {
            return true;
          }
        }
        return false;
      }

      // Permission-denied reads look like missing docs under current rules. If the user can
      // still write the list, keep retrying instead of silently dropping the mutation.
      const listId = listIdHint;
      if (listId) {
        const listAccess = await readListAccessInfo(listId);
        syncDebug('stale-updatePlaceStatus-missing-write-check', {
          membershipId,
          listId,
          access: listAccess.access,
        });
        if (listAccess.access === 'write') {
          const googlePlaceId = parsed?.googlePlaceId;
          if (googlePlaceId) {
            const linked = isGooglePlaceIdLinkedToList(listAccess.placeIds, googlePlaceId);
            syncDebug('stale-updatePlaceStatus-missing-place-link', {
              membershipId,
              listId,
              googlePlaceId,
              linked,
            });
            if (!linked) {
              return true;
            }
          }
          return false;
        }
      }

      return true;
    }

    const data = membershipSnap.data();
    if (placeStatusMatches(payload, data)) {
      syncDebug('stale-updatePlaceStatus-already-matched', { membershipId });
      return true;
    }

    const listId = data.listId || listIdHint;
    if (!listId) {
      syncDebug('stale-updatePlaceStatus-no-listId', { membershipId });
      return false;
    }

    const access = await readListWriteAccess(listId);
    syncDebug('stale-updatePlaceStatus-access', { membershipId, listId, access });
    return shouldDropForListAccess(access);
  } catch (membershipError) {
    if (!isPermissionDeniedError(membershipError)) {
      throw membershipError;
    }

    if (!listIdHint) {
      syncDebug('stale-updatePlaceStatus-denied-no-hint', { membershipId });
      return false;
    }

    const access = await readListWriteAccess(listIdHint);
    syncDebug('stale-updatePlaceStatus-denied-access', { membershipId, listIdHint, access });
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
