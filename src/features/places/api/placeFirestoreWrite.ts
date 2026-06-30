import {
  arrayRemove,
  arrayUnion,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { googlePlaceDocRef } from '@/features/places/api/googlePlaceFirestore';
import { listPlaceMembershipDocRef } from '@/features/places/api/listPlaceMembershipFirestore';
import {
  LIST_PLACE_IDS_FIELD,
  parseListPlaceMembershipDocId,
} from '@/features/places/constants/firestorePaths';
import type { GooglePlace } from '@/features/places/types/googlePlace';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import type { Place } from '@/features/places/types/place';
import { fetchListAccessFieldsForWrite } from '@/features/places/utils/fetchListAccessFieldsForWrite';
import { safeGetMembershipDoc } from '@/features/places/utils/safeMembershipGetDoc';
import {
  buildGooglePlacePayload,
  buildMembershipPayload,
  splitPlaceUpdates,
} from '@/features/places/utils/placeWriteSplit';
import { resolveWritableMembershipId } from '@/features/places/utils/resolveWritableMembershipId';
import { getCachedPlace } from '@/lib/localDb/placeCache';
import { omitUndefined } from '@/utils/objectUtils';
import { syncDebug, syncDebugError } from '@/utils/syncDebug';

export interface WritePlaceCreateInput {
  listId: string;
  membershipId: string;
  googlePlaceId: string;
  place: Omit<Place, 'id'>;
  timestamps?: { addedAt: Date; updatedAt: Date };
}

export function writePlaceCreateToBatch(batch: WriteBatch, input: WritePlaceCreateInput): void {
  const now = input.timestamps ?? { addedAt: new Date(), updatedAt: new Date() };
  const googlePlace = buildGooglePlacePayload(input.place, input.googlePlaceId, {
    createdAt: now.addedAt,
    updatedAt: now.updatedAt,
  });
  const membership = buildMembershipPayload(
    input.place,
    input.listId,
    input.googlePlaceId,
    input.membershipId,
    now
  );

  batch.set(googlePlaceDocRef(input.googlePlaceId), googlePlace, { merge: true });
  batch.set(listPlaceMembershipDocRef(input.membershipId), membership, { merge: true });
}

export async function writePlaceCreate(input: WritePlaceCreateInput): Promise<void> {
  const batch = writeBatch(db);
  writePlaceCreateToBatch(batch, input);
  await batch.commit();
}

/** Atomically creates googlePlaces + listPlaces docs and links the list. */
export async function writePlaceCreateAndLinkToList(input: WritePlaceCreateInput): Promise<void> {
  const batch = writeBatch(db);
  writePlaceCreateToBatch(batch, input);
  batch.update(doc(db, 'lists', input.listId), {
    [LIST_PLACE_IDS_FIELD]: arrayUnion(input.googlePlaceId),
    updatedAt: new Date(),
  });
  await batch.commit();
}

export async function addGooglePlaceIdToList(listId: string, googlePlaceId: string): Promise<void> {
  await updateDoc(doc(db, 'lists', listId), {
    [LIST_PLACE_IDS_FIELD]: arrayUnion(googlePlaceId),
    updatedAt: new Date(),
  });
}

export async function removeGooglePlaceIdFromList(
  listId: string,
  googlePlaceId: string
): Promise<void> {
  await updateDoc(doc(db, 'lists', listId), {
    [LIST_PLACE_IDS_FIELD]: arrayRemove(googlePlaceId),
    updatedAt: new Date(),
  });
}

export function resolveGooglePlaceIdFromMembershipId(membershipId: string): string | null {
  return parseListPlaceMembershipDocId(membershipId)?.googlePlaceId ?? null;
}

async function createMissingMembershipDoc(
  resolvedMembershipId: string,
  googlePlaceId: string,
  membershipPatch: Partial<ListPlaceMembership>
): Promise<void> {
  const parsed = parseListPlaceMembershipDocId(resolvedMembershipId);
  if (!parsed) {
    throw new Error(`Invalid membership ID: ${resolvedMembershipId}`);
  }

  const { listId } = parsed;
  const accessFields = await fetchListAccessFieldsForWrite(listId);
  const cached = await getCachedPlace(resolvedMembershipId);
  const now = membershipPatch.updatedAt ?? new Date();
  const userId = membershipPatch.updatedBy ?? cached?.updatedBy ?? auth.currentUser?.uid ?? '';

  const payload = omitUndefined({
    id: resolvedMembershipId,
    listId,
    googlePlaceId,
    ...accessFields,
    status: membershipPatch.status ?? cached?.status ?? 'not_visited',
    customStatus: membershipPatch.customStatus ?? cached?.customStatus,
    notes: membershipPatch.notes ?? cached?.notes,
    addedBy: cached?.addedBy || userId,
    addedAt: cached?.addedAt ?? now,
    updatedAt: now,
    updatedBy: userId || undefined,
    ...((membershipPatch.suppressNotifications ?? cached?.suppressNotifications)
      ? {
          suppressNotifications:
            membershipPatch.suppressNotifications ?? cached?.suppressNotifications,
        }
      : {}),
  }) as ListPlaceMembership;

  syncDebug('writePlaceUpdates-membership-create', {
    resolvedMembershipId,
    listId,
    googlePlaceId,
  });
  await setDoc(listPlaceMembershipDocRef(resolvedMembershipId), payload, { merge: true });
}

async function writeMembershipUpdates(
  resolvedMembershipId: string,
  googlePlaceId: string,
  membershipPatch: Partial<ListPlaceMembership>
): Promise<void> {
  const membershipRef = listPlaceMembershipDocRef(resolvedMembershipId);
  const membershipSnap = await safeGetMembershipDoc(
    membershipRef,
    'writePlaceUpdates-membership-get',
    {
      membershipId: resolvedMembershipId,
    }
  );

  if (membershipSnap.exists()) {
    await updateDoc(membershipRef, membershipPatch);
    return;
  }

  await createMissingMembershipDoc(resolvedMembershipId, googlePlaceId, membershipPatch);
}

export async function writePlaceUpdates(
  membershipId: string,
  updates: Partial<Place> & { updatedAt?: Date; updatedBy?: string }
): Promise<void> {
  syncDebug('writePlaceUpdates-start', { membershipId, keys: Object.keys(updates) });
  let resolvedMembershipId: string;
  try {
    resolvedMembershipId = await resolveWritableMembershipId(membershipId);
    syncDebug('writePlaceUpdates-resolved-id', {
      requested: membershipId,
      resolved: resolvedMembershipId,
      remapped: resolvedMembershipId !== membershipId,
    });
  } catch (error) {
    syncDebugError('writePlaceUpdates-resolve-failed', error, { membershipId });
    throw error;
  }

  const googlePlaceId = resolveGooglePlaceIdFromMembershipId(resolvedMembershipId);
  if (!googlePlaceId) {
    throw new Error(`Invalid membership ID: ${membershipId}`);
  }

  const { membershipUpdates, googlePlaceUpdates } = splitPlaceUpdates(updates);
  const now = updates.updatedAt ?? new Date();

  if (Object.keys(membershipUpdates).length > 0) {
    const membershipPatch: Partial<ListPlaceMembership> = {
      ...membershipUpdates,
      updatedAt: now,
    };
    syncDebug('writePlaceUpdates-membership-patch', {
      resolvedMembershipId,
      patch: membershipPatch,
    });
    try {
      await writeMembershipUpdates(resolvedMembershipId, googlePlaceId, membershipPatch);
      syncDebug('writePlaceUpdates-membership-ok', { resolvedMembershipId });
    } catch (error) {
      syncDebugError('writePlaceUpdates-membership-failed', error, { resolvedMembershipId });
      throw error;
    }
  }

  if (Object.keys(googlePlaceUpdates).length > 0) {
    const googlePatch: Partial<GooglePlace> = {
      ...googlePlaceUpdates,
      updatedAt: now,
    };
    await updateDoc(googlePlaceDocRef(googlePlaceId), googlePatch);
  }
}

export async function writeGooglePlacePhotoMetadata(
  membershipId: string,
  photoMetadata: Pick<GooglePlace, 'photoUrls' | 'thumbnailUrl' | 'photoCount' | 'updatedAt'>
): Promise<void> {
  const googlePlaceId = resolveGooglePlaceIdFromMembershipId(membershipId);
  if (!googlePlaceId) {
    throw new Error(`Invalid membership ID: ${membershipId}`);
  }

  await updateDoc(googlePlaceDocRef(googlePlaceId), photoMetadata);
}

export async function deletePlaceMembership(membershipId: string, listId: string): Promise<void> {
  const googlePlaceId = resolveGooglePlaceIdFromMembershipId(membershipId);
  if (!googlePlaceId) {
    throw new Error(`Invalid membership ID: ${membershipId}`);
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'lists', listId), {
    [LIST_PLACE_IDS_FIELD]: arrayRemove(googlePlaceId),
    updatedAt: new Date(),
  });
  batch.delete(listPlaceMembershipDocRef(membershipId));
  await batch.commit();
}
