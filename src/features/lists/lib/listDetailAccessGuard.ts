import type { PlaceList } from '@/features/lists/types/list';
import {
  shouldGrantListAccess,
  userCanReadList,
} from '@/features/lists/lib/listAccessFromSnapshot';

export function shouldApplyCachedListDetails(listAccessible: boolean, cancelled: boolean): boolean {
  return !cancelled && listAccessible;
}

export function shouldHydrateCachedListSnapshot(options: {
  list: PlaceList | null;
  userId: string | undefined;
  accessRevoked: boolean;
}): boolean {
  return shouldGrantListAccess({
    list: options.list,
    userId: options.userId,
    fromCache: true,
    accessRevoked: options.accessRevoked,
  });
}

export type ListFromContextAccess = 'grant' | 'deny-revoked' | 'deny-no-access';

export function resolveListFromContextAccess(options: {
  list: PlaceList;
  userId: string | undefined;
  accessRevoked: boolean;
}): ListFromContextAccess {
  if (!userCanReadList(options.list, options.userId)) {
    return 'deny-no-access';
  }
  // Mirror shouldGrantListAccess: public lists stay readable after saved-list removal.
  if (options.accessRevoked && !options.list.isPublic) {
    return 'deny-revoked';
  }
  return 'grant';
}

/** Clear sticky revocation when context shows trustworthy live access was restored. */
export function shouldClearAccessRevokedOnContextReturn(options: {
  list: PlaceList;
  userId: string | undefined;
}): boolean {
  if (!userCanReadList(options.list, options.userId)) {
    return false;
  }
  // Saved private rows may be stale Firestore cache after revocation; only owned/collaborator
  // query rows (isSavedList unset) indicate live membership was restored.
  if (options.list.isSavedList && !options.list.isPublic) {
    return false;
  }
  return true;
}
