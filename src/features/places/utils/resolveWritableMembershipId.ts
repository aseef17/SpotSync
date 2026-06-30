import { arrayRemove, arrayUnion, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { safeGetMembershipDoc } from '@/features/places/utils/safeMembershipGetDoc';
import { db } from '@/lib/firebase';
import { googlePlaceDocRef } from '@/features/places/api/googlePlaceFirestore';
import { listPlaceMembershipDocRef } from '@/features/places/api/listPlaceMembershipFirestore';
import {
  LIST_PLACE_IDS_FIELD,
  listPlaceMembershipDocId,
  parseListPlaceMembershipDocId,
} from '@/features/places/constants/firestorePaths';
import { fetchListAccessFieldsForWrite } from '@/features/places/utils/fetchListAccessFieldsForWrite';
import { stablePassportManualId } from '@/features/places/utils/stablePassportManualId';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import { getCachedPlace } from '@/lib/localDb/placeCache';
import { syncDebug, syncDebugError } from '@/utils/syncDebug';

type LegacyMembershipMergePayload = Pick<
  ListPlaceMembership,
  | 'status'
  | 'customStatus'
  | 'notes'
  | 'addedBy'
  | 'addedAt'
  | 'updatedBy'
  | 'suppressNotifications'
>;

function permissionDeniedError(message = 'Missing or insufficient permissions.'): Error {
  const error = new Error(message);
  (error as { code?: string }).code = 'permission-denied';
  return error;
}

/** Merges user progress from a legacy row without downgrading an existing keeper. */
export function mergeMembershipProgressFields(
  keeper: ListPlaceMembership,
  legacy: ListPlaceMembership
): Partial<LegacyMembershipMergePayload> {
  const merged = pickLegacyMembershipMergeFields(legacy);

  const keeperHasProgress = keeper.status !== undefined && keeper.status !== 'not_visited';
  const legacyHasProgress = legacy.status !== undefined && legacy.status !== 'not_visited';

  if (keeperHasProgress && !legacyHasProgress) {
    delete merged.status;
  } else if (!keeperHasProgress && legacyHasProgress) {
    merged.status = legacy.status;
  } else if (keeperHasProgress && legacyHasProgress) {
    delete merged.status;
  }

  if (legacy.customStatus && !keeper.customStatus) {
    merged.customStatus = legacy.customStatus;
  } else if (legacy.customStatus && keeper.customStatus) {
    delete merged.customStatus;
  }

  if (legacy.notes && keeper.notes && legacy.notes !== keeper.notes) {
    merged.notes = `${keeper.notes}\n${legacy.notes}`;
  } else if (legacy.notes && !keeper.notes) {
    merged.notes = legacy.notes;
  } else if (!legacy.notes) {
    delete merged.notes;
  }

  return merged;
}

/** Copies user-owned membership fields without overwriting canonical list access denorm. */
function pickLegacyMembershipMergeFields(
  legacyData: ListPlaceMembership
): Partial<LegacyMembershipMergePayload> {
  const merged: Partial<LegacyMembershipMergePayload> = {};

  if (legacyData.status !== undefined) {
    merged.status = legacyData.status;
  }
  if (legacyData.customStatus !== undefined) {
    merged.customStatus = legacyData.customStatus;
  }
  if (legacyData.notes !== undefined) {
    merged.notes = legacyData.notes;
  }
  if (legacyData.addedBy !== undefined) {
    merged.addedBy = legacyData.addedBy;
  }
  if (legacyData.addedAt !== undefined) {
    merged.addedAt = legacyData.addedAt;
  }
  if (legacyData.updatedBy !== undefined) {
    merged.updatedBy = legacyData.updatedBy;
  }
  if (legacyData.suppressNotifications !== undefined) {
    merged.suppressNotifications = legacyData.suppressNotifications;
  }

  return merged;
}

async function legacyMembershipIdForPlaceName(
  listId: string,
  placeName: string
): Promise<string | null> {
  const legacyGooglePlaceId = await stablePassportManualId(placeName);
  const legacyMembershipId = listPlaceMembershipDocId(listId, legacyGooglePlaceId);
  const legacySnap = await safeGetMembershipDoc(
    listPlaceMembershipDocRef(legacyMembershipId),
    'legacyMembershipIdForPlaceName'
  );
  return legacySnap.exists() ? legacyMembershipId : null;
}

async function findLegacyPassportMembershipId(
  listId: string,
  canonicalGooglePlaceId: string,
  membershipIdHint?: string
): Promise<string | null> {
  const canonicalSnap = await getDoc(googlePlaceDocRef(canonicalGooglePlaceId));
  if (canonicalSnap.exists()) {
    const placeName = canonicalSnap.data().name;
    if (placeName) {
      return legacyMembershipIdForPlaceName(listId, placeName);
    }
  }

  if (membershipIdHint) {
    const cachedPlace = await getCachedPlace(membershipIdHint);
    if (cachedPlace?.name) {
      return legacyMembershipIdForPlaceName(listId, cachedPlace.name);
    }
  }

  return null;
}

async function migrateLegacyMembershipToCanonical(
  listId: string,
  legacyMembershipId: string,
  canonicalGooglePlaceId: string
): Promise<string> {
  const canonicalMembershipId = listPlaceMembershipDocId(listId, canonicalGooglePlaceId);
  const legacyRef = listPlaceMembershipDocRef(legacyMembershipId);
  const canonicalRef = listPlaceMembershipDocRef(canonicalMembershipId);

  const [legacySnap, canonicalSnap] = await Promise.all([
    safeGetMembershipDoc(legacyRef, 'migrate-legacy'),
    safeGetMembershipDoc(canonicalRef, 'migrate-canonical'),
  ]);

  if (canonicalSnap.exists()) {
    if (legacySnap.exists() && legacyMembershipId !== canonicalMembershipId) {
      const legacyData = legacySnap.data() as ListPlaceMembership;
      const canonicalData = canonicalSnap.data() as ListPlaceMembership;
      const batch = writeBatch(db);
      batch.set(
        canonicalRef,
        {
          ...canonicalData,
          ...mergeMembershipProgressFields(canonicalData, legacyData),
          googlePlaceId: canonicalGooglePlaceId,
          updatedAt: new Date(),
        },
        { merge: true }
      );
      batch.delete(legacyRef);
      const legacyGooglePlaceId = parseListPlaceMembershipDocId(legacyMembershipId)?.googlePlaceId;
      if (legacyGooglePlaceId) {
        batch.update(doc(db, 'lists', listId), {
          [LIST_PLACE_IDS_FIELD]: arrayRemove(legacyGooglePlaceId),
          updatedAt: new Date(),
        });
      }
      await batch.commit();
    }
    return canonicalMembershipId;
  }

  if (!legacySnap.exists()) {
    return canonicalMembershipId;
  }

  const legacyGooglePlaceId = parseListPlaceMembershipDocId(legacyMembershipId)?.googlePlaceId;
  const listRef = doc(db, 'lists', listId);
  let accessFields;
  try {
    accessFields = await fetchListAccessFieldsForWrite(listId);
  } catch (error) {
    if (error instanceof Error && error.message === 'List not found') {
      throw permissionDeniedError();
    }
    throw error;
  }
  const legacyData = legacySnap.data() as ListPlaceMembership;

  const batch = writeBatch(db);
  batch.set(canonicalRef, {
    ...legacyData,
    ...accessFields,
    id: canonicalMembershipId,
    listId,
    googlePlaceId: canonicalGooglePlaceId,
    updatedAt: new Date(),
  });
  batch.delete(legacyRef);
  batch.update(listRef, {
    [LIST_PLACE_IDS_FIELD]: arrayUnion(canonicalGooglePlaceId),
    updatedAt: new Date(),
  });
  await batch.commit();

  if (legacyGooglePlaceId && legacyGooglePlaceId !== canonicalGooglePlaceId) {
    await updateDoc(listRef, {
      [LIST_PLACE_IDS_FIELD]: arrayRemove(legacyGooglePlaceId),
      updatedAt: new Date(),
    });
  }

  return canonicalMembershipId;
}

/**
 * Resolves a membership document ID for writes. When the client targets a canonical
 * ChIJ… membership that does not exist yet, migrates the legacy manual_passport_* doc.
 */
export async function resolveWritableMembershipId(membershipId: string): Promise<string> {
  const directSnap = await safeGetMembershipDoc(
    listPlaceMembershipDocRef(membershipId),
    'resolveMembership-direct-get',
    { membershipId }
  );
  syncDebug('resolveMembership-direct-get', {
    membershipId,
    exists: directSnap.exists(),
  });
  if (directSnap.exists()) {
    return membershipId;
  }

  const parsed = parseListPlaceMembershipDocId(membershipId);
  if (!parsed) {
    syncDebug('resolveMembership-invalid-id', { membershipId });
    return membershipId;
  }

  const { listId, googlePlaceId } = parsed;
  if (googlePlaceId.startsWith('manual_passport_')) {
    return membershipId;
  }

  const legacyMembershipId = await findLegacyPassportMembershipId(
    listId,
    googlePlaceId,
    membershipId
  );
  syncDebug('resolveMembership-legacy-lookup', {
    membershipId,
    legacyMembershipId,
  });
  if (!legacyMembershipId) {
    return membershipId;
  }

  try {
    const migrated = await migrateLegacyMembershipToCanonical(
      listId,
      legacyMembershipId,
      googlePlaceId
    );
    syncDebug('resolveMembership-migrated', {
      from: legacyMembershipId,
      to: migrated,
    });
    return migrated;
  } catch (error) {
    syncDebugError('resolveMembership-migrate-failed', error, {
      membershipId,
      legacyMembershipId,
    });
    throw error;
  }
}

export {
  findLegacyPassportMembershipId,
  migrateLegacyMembershipToCanonical,
  pickLegacyMembershipMergeFields,
};
