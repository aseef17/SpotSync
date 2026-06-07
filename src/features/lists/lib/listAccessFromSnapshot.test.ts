import { describe, expect, it } from 'vitest';
import {
  shouldGrantListAccess,
  userCanReadList,
} from '@/features/lists/lib/listAccessFromSnapshot';
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

describe('userCanReadList', () => {
  it('allows owners and collaborators on private lists', () => {
    expect(userCanReadList(list(), 'owner-a')).toBe(true);
    expect(userCanReadList(list(), 'collab-b')).toBe(true);
  });

  it('denies unrelated users on private lists', () => {
    expect(userCanReadList(list(), 'user-c')).toBe(false);
  });

  it('allows anyone to read public lists', () => {
    expect(userCanReadList(list({ isPublic: true }), 'user-c')).toBe(true);
  });
});

describe('shouldGrantListAccess', () => {
  it('denies cached snapshots after context revocation even with stale collaboratorIds', () => {
    expect(
      shouldGrantListAccess({
        list: list(),
        userId: 'collab-b',
        fromCache: true,
        accessRevoked: true,
      })
    ).toBe(false);
  });

  it('denies cached private list data for a different signed-in user', () => {
    expect(
      shouldGrantListAccess({
        list: list(),
        userId: 'user-c',
        fromCache: true,
        accessRevoked: false,
      })
    ).toBe(false);
  });

  it('allows offline cache hydration for authorized deep links', () => {
    expect(
      shouldGrantListAccess({
        list: list(),
        userId: 'collab-b',
        fromCache: true,
        accessRevoked: false,
      })
    ).toBe(true);
  });

  it('allows server-confirmed snapshots after revocation when access is still valid', () => {
    expect(
      shouldGrantListAccess({
        list: list(),
        userId: 'collab-b',
        fromCache: false,
        accessRevoked: true,
      })
    ).toBe(true);
  });

  it('still allows cached public lists after they are removed from saved lists', () => {
    expect(
      shouldGrantListAccess({
        list: list({ isPublic: true, collaboratorIds: [] }),
        userId: 'user-c',
        fromCache: true,
        accessRevoked: true,
      })
    ).toBe(true);
  });

  it('denies cached saved lists with stale isPublic after access was revoked', () => {
    expect(
      shouldGrantListAccess({
        list: list({ isSavedList: true, isPublic: true, collaboratorIds: [] }),
        userId: 'user-c',
        fromCache: true,
        accessRevoked: true,
      })
    ).toBe(false);
  });
});
