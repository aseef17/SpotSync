import { describe, expect, it } from 'vitest';
import {
  resolveListFromContextAccess,
  shouldApplyCachedListDetails,
  shouldClearAccessRevokedOnContextReturn,
  shouldConfirmListAccessFromServerWhenRevoked,
  shouldHydrateCachedListSnapshot,
} from '@/features/lists/lib/listDetailAccessGuard';
import type { PlaceList } from '@/features/lists/types/list';

const list = (overrides: Partial<PlaceList> = {}): PlaceList =>
  ({
    id: 'list-1',
    name: 'Test List',
    isPublic: false,
    ownerId: 'owner-a',
    collaborators: [],
    collaboratorIds: ['collab-b'],
    places: [],
    customStatuses: [],
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as PlaceList;

describe('shouldApplyCachedListDetails', () => {
  it('blocks cache hydration after access is revoked', () => {
    expect(shouldApplyCachedListDetails(false, false)).toBe(false);
  });

  it('allows cache hydration while the list remains accessible', () => {
    expect(shouldApplyCachedListDetails(true, false)).toBe(true);
  });

  it('ignores cancelled hydration work', () => {
    expect(shouldApplyCachedListDetails(true, true)).toBe(false);
  });

  it('blocks late pagination after access is revoked', () => {
    expect(shouldApplyCachedListDetails(false, false)).toBe(false);
  });
});

describe('shouldHydrateCachedListSnapshot', () => {
  it('denies cached places when access was revoked even with stale collaboratorIds', () => {
    expect(
      shouldHydrateCachedListSnapshot({
        list: list(),
        userId: 'collab-b',
        accessRevoked: true,
      })
    ).toBe(false);
  });

  it('allows cached places for authorized collaborators', () => {
    expect(
      shouldHydrateCachedListSnapshot({
        list: list(),
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe(true);
  });

  it('denies cached places when no list snapshot is available for access checks', () => {
    expect(
      shouldHydrateCachedListSnapshot({
        list: null,
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe(false);
  });

  it('denies cached places for saved private rows even with stale collaboratorIds', () => {
    expect(
      shouldHydrateCachedListSnapshot({
        list: list({ isSavedList: true }),
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe(false);
  });
});

describe('resolveListFromContextAccess', () => {
  it('grants access for authorized context lists', () => {
    expect(
      resolveListFromContextAccess({
        list: list(),
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe('grant');
  });

  it('denies stale private context after collaborator access was revoked', () => {
    expect(
      resolveListFromContextAccess({
        list: list(),
        userId: 'collab-b',
        accessRevoked: true,
      })
    ).toBe('deny-revoked');
  });

  it('still grants public lists after saved-list removal set accessRevoked', () => {
    expect(
      resolveListFromContextAccess({
        list: list({ isPublic: true, collaboratorIds: [] }),
        userId: 'user-c',
        accessRevoked: true,
      })
    ).toBe('grant');
  });

  it('denies context when the user is no longer a collaborator', () => {
    expect(
      resolveListFromContextAccess({
        list: list({ collaboratorIds: ['someone-else'] }),
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe('deny-no-access');
  });

  it('denies saved private context that still shows stale collaborator membership', () => {
    expect(
      resolveListFromContextAccess({
        list: list({ isSavedList: true }),
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe('deny-saved-private');
  });

  it('denies revoked saved private context with deny-revoked', () => {
    expect(
      resolveListFromContextAccess({
        list: list({ isSavedList: true }),
        userId: 'collab-b',
        accessRevoked: true,
      })
    ).toBe('deny-revoked');
  });

  it('denies saved context with stale isPublic after permission-denied revocation', () => {
    expect(
      resolveListFromContextAccess({
        list: list({ isSavedList: true, isPublic: true, collaboratorIds: [] }),
        userId: 'user-c',
        accessRevoked: true,
      })
    ).toBe('deny-revoked');
  });
});

describe('shouldConfirmListAccessFromServerWhenRevoked', () => {
  it('confirms server access when a trusted owned row appears after sticky revocation', () => {
    expect(
      shouldConfirmListAccessFromServerWhenRevoked({
        list: list(),
        userId: 'collab-b',
        accessRevoked: true,
        isOnline: true,
      })
    ).toBe(true);
  });

  it('confirms server access for saved public rows after a false revocation during reload', () => {
    expect(
      shouldConfirmListAccessFromServerWhenRevoked({
        list: list({ isSavedList: true, isPublic: true, collaboratorIds: [] }),
        userId: 'user-c',
        accessRevoked: true,
        isOnline: true,
      })
    ).toBe(true);
  });

  it('confirms server access for saved private rows that may retain stale collaboratorIds', () => {
    expect(
      shouldConfirmListAccessFromServerWhenRevoked({
        list: list({ isSavedList: true }),
        userId: 'collab-b',
        accessRevoked: true,
        isOnline: true,
      })
    ).toBe(true);
  });

  it('does not confirm for live public rows because context access already grants them', () => {
    expect(
      shouldConfirmListAccessFromServerWhenRevoked({
        list: list({ isPublic: true, collaboratorIds: [] }),
        userId: 'user-c',
        accessRevoked: true,
        isOnline: true,
      })
    ).toBe(false);
  });

  it('does not confirm when revocation is already cleared', () => {
    expect(
      shouldConfirmListAccessFromServerWhenRevoked({
        list: list(),
        userId: 'collab-b',
        accessRevoked: false,
        isOnline: true,
      })
    ).toBe(false);
  });

  it('does not confirm while offline because server reads are unavailable', () => {
    expect(
      shouldConfirmListAccessFromServerWhenRevoked({
        list: list(),
        userId: 'collab-b',
        accessRevoked: true,
        isOnline: false,
      })
    ).toBe(false);
  });
});

describe('shouldClearAccessRevokedOnContextReturn', () => {
  it('clears sticky revocation when a public list reappears in live context', () => {
    expect(
      shouldClearAccessRevokedOnContextReturn({
        hadListFromContext: false,
        list: list({ isPublic: true, collaboratorIds: [] }),
        userId: 'user-c',
      })
    ).toBe(true);
  });

  it('does not clear private lists from context alone because cache may be stale', () => {
    expect(
      shouldClearAccessRevokedOnContextReturn({
        hadListFromContext: false,
        list: list(),
        userId: 'collab-b',
      })
    ).toBe(false);
  });

  it('does not clear revocation while the list stayed in context', () => {
    expect(
      shouldClearAccessRevokedOnContextReturn({
        hadListFromContext: true,
        list: list({ isPublic: true, collaboratorIds: [] }),
        userId: 'user-c',
      })
    ).toBe(false);
  });

  it('does not clear revocation when a saved private list re-enters from stale cache', () => {
    expect(
      shouldClearAccessRevokedOnContextReturn({
        hadListFromContext: false,
        list: list({ isSavedList: true }),
        userId: 'collab-b',
      })
    ).toBe(false);
  });

  it('does not clear revocation when a saved list re-enters with stale isPublic', () => {
    expect(
      shouldClearAccessRevokedOnContextReturn({
        hadListFromContext: false,
        list: list({ isPublic: true, isSavedList: true, collaboratorIds: [] }),
        userId: 'user-c',
      })
    ).toBe(false);
  });
});
