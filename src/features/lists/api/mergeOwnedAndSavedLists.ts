import type { PlaceList } from '@/features/lists/types/list';
import { toMilliseconds } from '@/utils/date';

/**
 * Merge live owned/collaborator lists with saved-list rows.
 * Private saved-list cache can retain stale collaboratorIds after revocation while
 * profile.savedLists ids stay unchanged, so drop private saved rows that are not
 * mirrored in the live owned/collaborator query.
 */
export function mergeOwnedAndSavedLists(
  ownedLists: PlaceList[],
  savedLists: PlaceList[]
): PlaceList[] {
  const ownedIds = new Set(ownedLists.map((list) => list.id));
  const filteredSaved = savedLists.filter((list) => {
    if (ownedIds.has(list.id)) {
      return false;
    }
    if (list.isPublic) {
      return true;
    }
    return false;
  });

  const merged = [...ownedLists, ...filteredSaved];
  merged.sort((a, b) => toMilliseconds(b.updatedAt) - toMilliseconds(a.updatedAt));
  return merged;
}
