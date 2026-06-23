import { arrayRemove, arrayUnion, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
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
import { getCachedPlace } from '@/lib/localDb/placeCache';
import { syncDebug, syncDebugError } from '@/utils/syncDebug';

const LEGACY_MEMBERSHIP_MERGE_FIELDS = [
  'status',
  'customStatus',
  'notes',
  'addedBy',
  'addedAt',
  'updatedBy',
  'suppressNotifications',
] as const;

/** Copies user-owned membership fields without overwriting canonical list access denorm. */
function pickLegacyMembershipMergeFields(
  legacyData: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const key of LEGACY_MEMBERSHIP_MERGE_FIELDS) {
    if (legacyData[key] !== undefined) {
      merged[key] = legacyData[key];
    }
  }
  return merged;
}

async function legacyMembershipIdForPlaceName(
  listId: string,
  placeName: string
): Promise<string | null> {
  const legacyGooglePlaceId = await stablePassportManualId(placeName);
  const legacyMembershipId = listPlaceMembershipDocId(listId, legacyGooglePlaceId);
  const legacySnap = await getDoc(listPlaceMembershipDocRef(legacyMembershipId));
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

  const [legacySnap, canonicalSnap] = await Promise.all([getDoc(legacyRef), getDoc(canonicalRef)]);

  if (canonicalSnap.exists()) {
    if (legacySnap.exists() && legacyMembershipId !== canonicalMembershipId) {
      const batch = writeBatch(db);
      batch.set(
        canonicalRef,
        {
          ...canonicalSnap.data(),
          ...pickLegacyMembershipMergeFields(
            legacySnap.data() as unknown as Record<string, unknown>
          ),
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
  const accessFields = await fetchListAccessFieldsForWrite(listId);
  const legacyFields = pickLegacyMembershipMergeFields(
    legacySnap.data() as unknown as Record<string, unknown>
  );

  const batch = writeBatch(db);
  batch.set(canonicalRef, {
    listId,
    googlePlaceId: canonicalGooglePlaceId,
    ...accessFields,
    ...legacyFields,
    status: legacyFields.status ?? 'not_visited',
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
  const directSnap = await getDoc(listPlaceMembershipDocRef(membershipId));
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

export { findLegacyPassportMembershipId };
