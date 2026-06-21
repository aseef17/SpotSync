import { where, type QueryConstraint } from 'firebase/firestore';
import type { PlaceList } from '@/features/lists/types/list';

/** Denormalized list access fields stored on place docs to avoid security-rule get() reads. */
export interface PlaceListAccessFields {
  listOwnerId: string;
  listIsPublic: boolean;
  listCollaboratorIds: string[];
}

/** Viewer + list metadata used to build security-rule-compatible place queries. */
export interface PlaceListAccessQuery {
  listId: string;
  userId: string;
  ownerId: string;
  isPublic: boolean;
}

export function toPlaceListAccessQuery(
  listId: string,
  userId: string,
  list: Pick<PlaceList, 'ownerId' | 'isPublic'>
): PlaceListAccessQuery {
  return {
    listId,
    userId,
    ownerId: list.ownerId,
    isPublic: list.isPublic === true,
  };
}

/** Firestore query constraints that match listPlaces security rules for the current viewer. */
export function buildListPlaceMembershipAccessConstraints(
  access: PlaceListAccessQuery
): QueryConstraint[] {
  if (access.isPublic) {
    return [where('listId', '==', access.listId), where('listIsPublic', '==', true)];
  }

  if (access.userId === access.ownerId) {
    return [where('listId', '==', access.listId), where('listOwnerId', '==', access.userId)];
  }

  return [
    where('listId', '==', access.listId),
    where('listCollaboratorIds', 'array-contains', access.userId),
  ];
}

/** Stable key for place-query subscriptions; ignores list metadata like the places array. */
export function getPlaceListAccessKey(
  listId: string,
  userId: string,
  list: Pick<PlaceList, 'ownerId' | 'isPublic'>
): string {
  return `${listId}:${userId}:${list.ownerId}:${list.isPublic === true}`;
}

export function getPlaceListAccessFields(
  list: Pick<PlaceList, 'ownerId' | 'isPublic' | 'collaboratorIds'>
): PlaceListAccessFields {
  return {
    listOwnerId: list.ownerId,
    listIsPublic: list.isPublic === true,
    listCollaboratorIds: list.collaboratorIds ?? [list.ownerId],
  };
}

export function getPrimaryPhotoUrl(photoUrls?: string[]): string | undefined {
  if (!photoUrls?.length) return undefined;
  return photoUrls[0];
}

/** Cap stored gallery URLs to reduce document size; full set can be re-fetched on detail view. */
export const MAX_STORED_PHOTO_URLS = 5;

export function trimPhotoUrlsForStorage(photoUrls?: string[]): string[] | undefined {
  if (!photoUrls?.length) return undefined;
  return photoUrls.slice(0, MAX_STORED_PHOTO_URLS);
}
