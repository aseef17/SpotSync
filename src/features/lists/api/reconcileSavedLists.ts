import type { PlaceList } from '@/features/lists/types/list';

export function reconcileSavedLists(options: {
  profileIds: string[];
  ownedIds: Set<string>;
  previousSavedLists: PlaceList[];
  fetched: PlaceList[];
  resolved: boolean;
}): PlaceList[] {
  const { profileIds, ownedIds, previousSavedLists, fetched, resolved } = options;

  if (resolved) {
    return fetched;
  }

  const profileIdSet = new Set(profileIds);
  const byId = new Map<string, PlaceList>();

  for (const list of previousSavedLists) {
    if (profileIdSet.has(list.id) && !ownedIds.has(list.id)) {
      byId.set(list.id, list);
    }
  }

  for (const list of fetched) {
    if (!ownedIds.has(list.id)) {
      byId.set(list.id, list);
    }
  }

  return Array.from(byId.values());
}
