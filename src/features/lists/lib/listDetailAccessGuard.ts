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
  if (options.list?.isSavedList && !options.list.isPublic) {
    return false;
  }
  return shouldGrantListAccess({
    list: options.list,
    userId: options.userId,
    fromCache: true,
    accessRevoked: options.accessRevoked,
  });
}

export type ListFromContextAccess =
  | 'grant'
  | 'deny-revoked'
  | 'deny-no-access'
  | 'deny-saved-private';

export function resolveListFromContextAccess(options: {
  list: PlaceList;
  userId: string | undefined;
  accessRevoked: boolean;
  serverVerifiedList?: PlaceList | null;
}): ListFromContextAccess {
  const serverAccess = Boolean(
    options.serverVerifiedList &&
      userCanReadList(options.serverVerifiedList, options.userId)
  );

  // Saved private rows come from saved-list fetches and may retain stale collaboratorIds
  // or isPublic after visibility changes; only server-confirmed metadata is trustworthy.
  if (options.list.isSavedList && !options.list.isPublic) {
    if (serverAccess) {
      return 'grant';
    }
    return options.accessRevoked ? 'deny-revoked' : 'deny-saved-private';
  }
  // Saved-list cache can retain stale isPublic after a list is made private; do not
  // re-grant once accessRevoked was set (e.g. from a permission-denied subscription).
  if (options.accessRevoked && options.list.isSavedList) {
    if (serverAccess) {
      return 'grant';
    }
    return 'deny-revoked';
  }
  if (!userCanReadList(options.list, options.userId)) {
    if (options.list.isSavedList && serverAccess) {
      return 'grant';
    }
    return 'deny-no-access';
  }
  // Mirror shouldGrantListAccess: public lists stay readable after saved-list removal.
  if (options.accessRevoked && !options.list.isPublic) {
    if (serverAccess) {
      return 'grant';
    }
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
  // Saved-list rows may carry stale isPublic after visibility changes; require server confirmation.
  if (options.list.isSavedList) {
    return false;
  }
  return !options.hadListFromContext && userCanReadList(options.list, options.userId);
}
