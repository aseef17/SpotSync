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
  hadListFromContext: boolean;
}): ListFromContextAccess {
  if (!userCanReadList(options.list, options.userId)) {
    return 'deny-no-access';
  }
  // The list disappeared from context (revocation or transient loss) and came back with
  // live authorization. Clear stale revocation without reopening the window where a list
  // that never left context could be re-granted from stale collaboratorIds.
  if (options.accessRevoked && !options.hadListFromContext) {
    return 'grant';
  }
  if (options.accessRevoked) {
    return 'deny-revoked';
  }
  return 'grant';
}
