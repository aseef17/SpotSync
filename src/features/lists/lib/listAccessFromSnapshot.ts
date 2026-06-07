import type { PlaceList } from '@/features/lists/types/list';

export function userCanReadList(list: PlaceList, userId: string | undefined): boolean {
  if (list.isPublic) {
    return true;
  }
  if (!userId) {
    return false;
  }
  return list.ownerId === userId || list.collaboratorIds.includes(userId);
}

export function shouldGrantListAccess(options: {
  list: PlaceList | null;
  userId: string | undefined;
  fromCache: boolean;
  accessRevoked: boolean;
}): boolean {
  if (!options.list) {
    return false;
  }
  if (!userCanReadList(options.list, options.userId)) {
    return false;
  }
  // Private lists may linger in persistent cache after revocation or account switch.
  // Public lists stay readable per Firestore rules even when removed from saved lists.
  if (options.accessRevoked && options.fromCache && !options.list.isPublic) {
    return false;
  }
  return true;
}
