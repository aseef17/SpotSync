import { describe, expect, it } from 'vitest';
import {
  resolveListFromContextAccess,
  shouldApplyCachedListDetails,
  shouldApplyContextListSnapshot,
  shouldApplyServerConfirmedPrivateAccess,
  shouldClearAccessRevokedOnContextReturn,
  shouldConfirmPrivateAccessFromTrustedContext,
  shouldConfirmSavedListAccessFromServer,
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

describe('saved-list server confirmation flow', () => {
  it('keeps denying saved context until server confirmation clears revocation', () => {
    const staleSavedPublic = list({
      isSavedList: true,
      isPublic: true,
      collaboratorIds: [],
    });
    let accessRevoked = true;

    expect(
      shouldConfirmSavedListAccessFromServer({
        list: staleSavedPublic,
        accessRevoked,
        isOnline: true,
      })
    ).toBe(true);

    expect(
      resolveListFromContextAccess({
        list: staleSavedPublic,
        userId: 'user-c',
        accessRevoked,
      })
    ).toBe('deny-revoked');

    accessRevoked = false;

    expect(
      resolveListFromContextAccess({
        list: staleSavedPublic,
        userId: 'user-c',
        accessRevoked,
      })
    ).toBe('grant');
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

describe('shouldApplyServerConfirmedPrivateAccess', () => {
  it('applies server confirmation for the currently mounted list', () => {
    expect(
      shouldApplyServerConfirmedPrivateAccess({
        targetListId: 'list-1',
        currentListId: 'list-1',
        confirmedList: list(),
        userId: 'collab-b',
      })
    ).toBe(true);
  });

  it('ignores late confirmations after navigation to another list', () => {
    expect(
      shouldApplyServerConfirmedPrivateAccess({
        targetListId: 'list-1',
        currentListId: 'list-2',
        confirmedList: list(),
        userId: 'collab-b',
      })
    ).toBe(false);
  });

  it('rejects mismatched server payloads', () => {
    expect(
      shouldApplyServerConfirmedPrivateAccess({
        targetListId: 'list-1',
        currentListId: 'list-1',
        confirmedList: list({ id: 'list-2' }),
        userId: 'collab-b',
      })
    ).toBe(false);
  });

  it('rejects confirmations when the user no longer has access', () => {
    expect(
      shouldApplyServerConfirmedPrivateAccess({
        targetListId: 'list-1',
        currentListId: 'list-1',
        confirmedList: list({ collaboratorIds: ['someone-else'] }),
        userId: 'collab-b',
      })
    ).toBe(false);
  });
});

describe('shouldConfirmSavedListAccessFromServer', () => {
  it('confirms server access for saved lists while revocation is sticky', () => {
    expect(
      shouldConfirmSavedListAccessFromServer({
        list: list({ isSavedList: true, isPublic: true, collaboratorIds: [] }),
        accessRevoked: true,
        isOnline: true,
      })
    ).toBe(true);
  });

  it('does not confirm when revocation is already cleared', () => {
    expect(
      shouldConfirmSavedListAccessFromServer({
        list: list({ isSavedList: true, isPublic: true, collaboratorIds: [] }),
        accessRevoked: false,
        isOnline: true,
      })
    ).toBe(false);
  });

  it('does not confirm while offline because server reads are unavailable', () => {
    expect(
      shouldConfirmSavedListAccessFromServer({
        list: list({ isSavedList: true, isPublic: true, collaboratorIds: [] }),
        accessRevoked: true,
        isOnline: false,
      })
    ).toBe(false);
  });

  it('does not confirm for trusted owned rows handled separately', () => {
    expect(
      shouldConfirmSavedListAccessFromServer({
        list: list(),
        accessRevoked: true,
        isOnline: true,
      })
    ).toBe(false);
  });
});

describe('shouldConfirmPrivateAccessFromTrustedContext', () => {
  it('confirms server access when a trusted owned row appears after sticky revocation', () => {
    expect(
      shouldConfirmPrivateAccessFromTrustedContext({
        list: list(),
        userId: 'collab-b',
        accessRevoked: true,
        isOnline: true,
      })
    ).toBe(true);
  });

  it('does not confirm for untrusted saved private rows that may retain stale collaboratorIds', () => {
    expect(
      shouldConfirmPrivateAccessFromTrustedContext({
        list: list({ isSavedList: true }),
        userId: 'collab-b',
        accessRevoked: true,
        isOnline: true,
      })
    ).toBe(false);
  });

  it('does not confirm when revocation is already cleared', () => {
    expect(
      shouldConfirmPrivateAccessFromTrustedContext({
        list: list(),
        userId: 'collab-b',
        accessRevoked: false,
        isOnline: true,
      })
    ).toBe(false);
  });

  it('does not confirm while offline because server reads are unavailable', () => {
    expect(
      shouldConfirmPrivateAccessFromTrustedContext({
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

describe('shouldApplyContextListSnapshot', () => {
  it('does not overwrite server-confirmed list data with stale saved-list context', () => {
    expect(
      shouldApplyContextListSnapshot({
        listFromContext: list({ isSavedList: true, isPublic: true, collaboratorIds: [] }),
        serverVerifiedPrivateAccess: true,
      })
    ).toBe(false);
  });

  it('still applies trusted owned context after server confirmation', () => {
    expect(
      shouldApplyContextListSnapshot({
        listFromContext: list(),
        serverVerifiedPrivateAccess: true,
      })
    ).toBe(true);
  });

  it('applies saved-list context before server verification', () => {
    expect(
      shouldApplyContextListSnapshot({
        listFromContext: list({ isSavedList: true, isPublic: true, collaboratorIds: [] }),
        serverVerifiedPrivateAccess: false,
      })
    ).toBe(true);
  });
});

describe('useListDetails hydrateFromCache context snapshot guard', () => {
  it('blocks cache hydration from overwriting server-confirmed list metadata', () => {
    const staleSavedPublic = list({
      isSavedList: true,
      isPublic: true,
      collaboratorIds: [],
    });
    const canHydrateSnapshot = shouldHydrateCachedListSnapshot({
      list: staleSavedPublic,
      userId: 'user-c',
      accessRevoked: false,
    });
    const canApplyContextSnapshot = shouldApplyContextListSnapshot({
      listFromContext: staleSavedPublic,
      serverVerifiedPrivateAccess: true,
    });

    expect(canHydrateSnapshot).toBe(true);
    expect(canApplyContextSnapshot).toBe(false);
    expect(canHydrateSnapshot && canApplyContextSnapshot).toBe(false);
  });
});

describe('useListDetails context access ordering', () => {
  it('does not clear accessRevoked before denying stale saved public context', () => {
    const staleSavedPublic = list({
      isSavedList: true,
      isPublic: true,
      collaboratorIds: [],
    });
    let accessRevoked = true;

    if (
      shouldClearAccessRevokedOnContextReturn({
        hadListFromContext: false,
        list: staleSavedPublic,
        userId: 'user-c',
      })
    ) {
      accessRevoked = false;
    }

    expect(
      resolveListFromContextAccess({
        list: staleSavedPublic,
        userId: 'user-c',
        accessRevoked,
      })
    ).toBe('deny-revoked');
  });
});
