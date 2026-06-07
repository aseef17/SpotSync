import {
  arrayRemove,
  arrayUnion,
  doc,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { googlePlaceDocRef } from '@/features/places/api/googlePlaceFirestore';
import { listPlaceMembershipDocRef } from '@/features/places/api/listPlaceMembershipFirestore';
import {
  LIST_PLACE_IDS_FIELD,
  parseListPlaceMembershipDocId,
} from '@/features/places/constants/firestorePaths';
import type { GooglePlace } from '@/features/places/types/googlePlace';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import type { Place } from '@/features/places/types/place';
import {
  buildGooglePlacePayload,
  buildMembershipPayload,
  splitPlaceUpdates,
} from '@/features/places/utils/placeWriteSplit';

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

export async function writePlaceUpdates(
  membershipId: string,
  updates: Partial<Place> & { updatedAt?: Date; updatedBy?: string }
): Promise<void> {
  const googlePlaceId = resolveGooglePlaceIdFromMembershipId(membershipId);
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
    await updateDoc(listPlaceMembershipDocRef(membershipId), membershipPatch);
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
