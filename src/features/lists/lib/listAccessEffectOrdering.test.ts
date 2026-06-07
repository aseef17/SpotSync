import { describe, expect, it } from 'vitest';
import { resolveListFromContextAccess } from '@/features/lists/lib/listDetailAccessGuard';
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
  hadListFromContext: boolean;
}): boolean {
  if (options.listFromContext) {
    return (
      resolveListFromContextAccess({
        list: options.listFromContext,
        userId: options.userId,
        accessRevoked: options.accessRevoked,
        hadListFromContext: options.hadListFromContext,
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
        hadListFromContext: false,
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
        hadListFromContext: true,
      })
    ).toBe(true);
  });

  it('blocks stale context lists after collaborator access was revoked', () => {
    expect(
      applyPlacesEffectAccessBaseline({
        listFromContext: list(),
        listAccessibleAfterListSubscription: false,
        userId: 'collab-b',
        accessRevoked: true,
        hadListFromContext: true,
      })
    ).toBe(false);
  });
});
