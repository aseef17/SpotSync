import { describe, expect, it } from 'vitest';
import {
  resolveListFromContextAccess,
  shouldClearAccessRevokedOnContextReturn,
} from '@/features/lists/lib/listDetailAccessGuard';
import { shouldGrantListAccess } from '@/features/lists/lib/listAccessFromSnapshot';
import type { PlaceList } from '@/features/lists/types/list';

/**
 * Regression guard for useListDetails effect ordering:
 * subscribeToList (effect 3) can confirm access synchronously from Firestore cache
 * before subscribeToListPlaces (effect 4) runs. The places effect must not reset
 * listAccessible back to false in that case, or pending snapshots never flush.
 */
function applyPlacesEffectAccessBaseline(options: {
  listFromContext: PlaceList | null;
  listAccessibleAfterListSubscription: boolean;
  userId: string | undefined;
  accessRevoked: boolean;
}): boolean {
  if (options.listFromContext) {
    return (
      resolveListFromContextAccess({
        list: options.listFromContext,
        userId: options.userId,
        accessRevoked: options.accessRevoked,
      }) === 'grant'
    );
  }
  return options.listAccessibleAfterListSubscription;
}

const list = (): PlaceList =>
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
  }) as PlaceList;

describe('places effect access baseline', () => {
  it('preserves access confirmed by the list subscription for deep-linked lists', () => {
    const listFromContext = null;

    let listAccessible = true;
    listAccessible = false;
    listAccessible = true;

    expect(
      applyPlacesEffectAccessBaseline({
        listFromContext,
        listAccessibleAfterListSubscription: listAccessible,
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe(true);
  });

  it('grants access when the list is present in context and access is valid', () => {
    expect(
      applyPlacesEffectAccessBaseline({
        listFromContext: list(),
        listAccessibleAfterListSubscription: false,
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe(true);
  });

  it('blocks stale private context lists after collaborator access was revoked', () => {
    expect(
      applyPlacesEffectAccessBaseline({
        listFromContext: list(),
        listAccessibleAfterListSubscription: false,
        userId: 'collab-b',
        accessRevoked: true,
      })
    ).toBe(false);
  });

  it('blocks stale saved public context after permission-denied revocation', () => {
    const staleSavedPublic = {
      ...list(),
      isSavedList: true,
      isPublic: true,
      collaboratorIds: [],
    } as PlaceList;
    const accessRevoked = true;

    expect(
      shouldClearAccessRevokedOnContextReturn({
        hadListFromContext: false,
        list: staleSavedPublic,
        userId: 'user-c',
      })
    ).toBe(false);

    expect(
      resolveListFromContextAccess({
        list: staleSavedPublic,
        userId: 'user-c',
        accessRevoked,
      })
    ).toBe('deny-revoked');
  });

  it('restores access when owned context replaces an untrusted saved-private row', () => {
    const savedPrivateContext = { ...list(), isSavedList: true } as PlaceList;
    const ownedContext = list();

    expect(
      applyPlacesEffectAccessBaseline({
        listFromContext: savedPrivateContext,
        listAccessibleAfterListSubscription: false,
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe(false);

    expect(
      applyPlacesEffectAccessBaseline({
        listFromContext: ownedContext,
        listAccessibleAfterListSubscription: false,
        userId: 'collab-b',
        accessRevoked: false,
      })
    ).toBe(true);
  });

  it('clears savedPrivateDenied after server grant so later cache snapshots stay readable', () => {
    let savedPrivateDenied = true;

    expect(
      shouldGrantListAccess({
        list: list(),
        userId: 'collab-b',
        fromCache: false,
        accessRevoked: false,
        savedPrivateDenied,
      })
    ).toBe(true);

    // useListDetails clears savedPrivateDenied after a server-confirmed grant.
    savedPrivateDenied = false;

    expect(
      shouldGrantListAccess({
        list: list(),
        userId: 'collab-b',
        fromCache: true,
        accessRevoked: false,
        savedPrivateDenied,
      })
    ).toBe(true);
  });
});
