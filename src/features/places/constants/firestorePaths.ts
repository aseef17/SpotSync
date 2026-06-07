/** Top-level Firestore collection for canonical Google place metadata. */
export const GOOGLE_PLACES_COLLECTION = 'googlePlaces';

/** Top-level Firestore collection for per-list place memberships. */
export const LIST_PLACES_COLLECTION = 'listPlaces';

/** Field on lists/{listId} storing canonical googlePlaceIds. */
export const LIST_PLACE_IDS_FIELD = 'placeIds';

/**
 * Strips the Places API resource prefix (`places/ChIJ…`) so IDs are safe as
 * Firestore document segments. Photo resource names (`places/ChIJ…/photos/…`)
 * are left unchanged.
 */
export function normalizeGooglePlaceId(googlePlaceId: string): string {
  const match = googlePlaceId.match(/^places\/([^/]+)$/);
  return match ? match[1] : googlePlaceId;
}

/**
 * Builds the composite document ID for a list place membership.
 * Format: `{listId}_{googlePlaceId}`
 */
export function listPlaceMembershipDocId(listId: string, googlePlaceId: string): string {
  return `${listId}_${googlePlaceId}`;
}

/**
 * Parses a composite membership document ID into its parts.
 * Returns null if the ID does not contain a separator.
 */
export function parseListPlaceMembershipDocId(
  membershipId: string
): { listId: string; googlePlaceId: string } | null {
  const separatorIndex = membershipId.indexOf('_');
  if (separatorIndex <= 0 || separatorIndex >= membershipId.length - 1) {
    return null;
  }

  return {
    listId: membershipId.slice(0, separatorIndex),
    googlePlaceId: membershipId.slice(separatorIndex + 1),
  };
}
