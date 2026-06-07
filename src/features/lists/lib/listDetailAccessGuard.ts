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
  online?: boolean;
}): boolean {
  return shouldGrantListAccess({
    list: options.list,
    userId: options.userId,
    fromCache: true,
    accessRevoked: options.accessRevoked,
    online: options.online,
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

/** Clear sticky revocation when a public list reappears in live context after being absent. */
export function shouldClearAccessRevokedOnContextReturn(options: {
  hadListFromContext: boolean;
  list: PlaceList;
  userId: string | undefined;
}): boolean {
  // Private lists can linger in persistent cache with stale collaboratorIds after revocation.
  // Those are cleared only after server-confirmed access in useListDetails.
  if (!options.list.isPublic) {
    return false;
  }
  return !options.hadListFromContext && userCanReadList(options.list, options.userId);
}
