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
  savedPrivateDenied?: boolean;
}): boolean {
  if (options.list?.isSavedList && !options.list.isPublic) {
    return false;
  }
  return shouldGrantListAccess({
    list: options.list,
    userId: options.userId,
    fromCache: true,
    accessRevoked: options.accessRevoked,
    savedPrivateDenied: options.savedPrivateDenied,
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
}): ListFromContextAccess {
  if (!userCanReadList(options.list, options.userId)) {
    return 'deny-no-access';
  }
  // Saved private rows come from saved-list fetches and may retain stale collaboratorIds
  // after revocation; only owned/collaborator query rows (isSavedList unset) are trustworthy.
  if (options.list.isSavedList && !options.list.isPublic) {
    return options.accessRevoked ? 'deny-revoked' : 'deny-saved-private';
  }
  // Saved-list cache can retain stale isPublic after a list is made private; do not
  // re-grant once accessRevoked was set (e.g. from a permission-denied subscription).
  if (options.accessRevoked && options.list.isSavedList) {
    return 'deny-revoked';
  }
  // Mirror shouldGrantListAccess: public lists stay readable after saved-list removal.
  if (options.accessRevoked && !options.list.isPublic) {
    return 'deny-revoked';
  }
  return 'grant';
}

/** Keep server-confirmed list metadata; saved rows may carry stale isPublic. */
export function shouldApplyContextListSnapshot(options: {
  listFromContext: PlaceList;
  serverVerified: boolean;
}): boolean {
  return !(options.serverVerified && options.listFromContext.isSavedList);
}

/** Ignore late server confirmations after navigation or mismatched payloads. */
export function shouldApplyServerConfirmedPrivateAccess(options: {
  targetListId: string;
  currentListId: string | undefined;
  confirmedList: PlaceList | null;
  userId: string | undefined;
}): boolean {
  if (!options.currentListId || options.targetListId !== options.currentListId) {
    return false;
  }
  if (!options.confirmedList || options.confirmedList.id !== options.targetListId) {
    return false;
  }
  return userCanReadList(options.confirmedList, options.userId);
}

/** Re-check server access for trusted owned/collaborator rows while revocation is sticky. */
export function shouldConfirmPrivateAccessFromTrustedContext(options: {
  list: PlaceList;
  userId: string | undefined;
  accessRevoked: boolean;
  isOnline: boolean;
}): boolean {
  return (
    options.accessRevoked &&
    options.isOnline &&
    !options.list.isPublic &&
    !options.list.isSavedList &&
    userCanReadList(options.list, options.userId)
  );
}

/** Re-check server access for saved-list rows; cached isPublic may be stale after visibility changes. */
export function shouldConfirmSavedListAccessFromServer(options: {
  list: PlaceList;
  accessRevoked: boolean;
  isOnline: boolean;
}): boolean {
  return Boolean(options.accessRevoked && options.isOnline && options.list.isSavedList);
}

/** Clear sticky revocation when a public list reappears in live context after being absent. */
export function shouldClearAccessRevokedOnContextReturn(options: {
  hadListFromContext: boolean;
  list: PlaceList;
  userId: string | undefined;
}): boolean {
  if (options.hadListFromContext || !userCanReadList(options.list, options.userId)) {
    return false;
  }
  // Private lists can linger in persistent cache with stale collaboratorIds after revocation.
  // Those are cleared only after server-confirmed access in useListDetails.
  if (!options.list.isPublic) {
    return false;
  }
  // Saved-list rows may carry stale isPublic after visibility changes.
  // Only owned/collaborator query rows (isSavedList unset) indicate live access was restored.
  if (options.list.isSavedList) {
    return false;
  }
  return true;
}
