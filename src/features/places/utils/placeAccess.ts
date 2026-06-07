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
