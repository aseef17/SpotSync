import { describe, expect, it } from 'vitest';
import {
  resolveListFromContextAccess,
  shouldApplyCachedListDetails,
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
});

describe('resolveListFromContextAccess', () => {
  it('grants access for authorized context lists', () => {
    expect(
      resolveListFromContextAccess({
        list: list(),
        userId: 'collab-b',
        accessRevoked: false,
        hadListFromContext: true,
      })
    ).toBe('grant');
  });

  it('denies stale context after collaborator access was revoked', () => {
    expect(
      resolveListFromContextAccess({
        list: list(),
        userId: 'collab-b',
        accessRevoked: true,
        hadListFromContext: true,
      })
    ).toBe('deny-revoked');
  });

  it('re-grants access when a list returns to context after removal', () => {
    expect(
      resolveListFromContextAccess({
        list: list(),
        userId: 'collab-b',
        accessRevoked: true,
        hadListFromContext: false,
      })
    ).toBe('grant');
  });

  it('denies context when the user is no longer a collaborator', () => {
    expect(
      resolveListFromContextAccess({
        list: list({ collaboratorIds: ['someone-else'] }),
        userId: 'collab-b',
        accessRevoked: false,
        hadListFromContext: true,
      })
    ).toBe('deny-no-access');
  });
});
