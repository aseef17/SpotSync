import { describe, expect, it } from 'vitest';
import {
  getPlaceListAccessKey,
  toPlaceListAccessQuery,
  buildListPlaceMembershipAccessConstraints,
} from '@/features/places/utils/placeAccess';
import type { PlaceList } from '@/features/lists/types/list';

const baseList = (overrides: Partial<PlaceList> = {}): PlaceList =>
  ({
    id: 'list-1',
    ownerId: 'owner-1',
    isPublic: false,
    name: 'Test list',
    collaborators: [],
    collaboratorIds: [],
    places: [],
    customStatuses: [],
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as PlaceList;

describe('getPlaceListAccessKey', () => {
  it('stays stable when only non-access list metadata changes', () => {
    const before = getPlaceListAccessKey('list-1', 'user-1', baseList());
    const after = getPlaceListAccessKey(
      'list-1',
      'user-1',
      baseList({ name: 'Updated title', description: 'New description' })
    );
    expect(after).toBe(before);
  });

  it('changes when access-relevant fields change', () => {
    const before = getPlaceListAccessKey('list-1', 'user-1', baseList());
    const ownerChanged = getPlaceListAccessKey(
      'list-1',
      'user-1',
      baseList({ ownerId: 'owner-2' })
    );
    const visibilityChanged = getPlaceListAccessKey(
      'list-1',
      'user-1',
      baseList({ isPublic: true })
    );

    expect(ownerChanged).not.toBe(before);
    expect(visibilityChanged).not.toBe(before);
  });
});

describe('toPlaceListAccessQuery', () => {
  it('only depends on owner and visibility fields', () => {
    expect(toPlaceListAccessQuery('list-1', 'user-1', baseList())).toEqual({
      listId: 'list-1',
      userId: 'user-1',
      ownerId: 'owner-1',
      isPublic: false,
    });
  });
});

describe('buildListPlaceMembershipAccessConstraints', () => {
  it('scopes owner queries by listId and listOwnerId', () => {
    const constraints = buildListPlaceMembershipAccessConstraints({
      listId: 'list-1',
      userId: 'owner-1',
      ownerId: 'owner-1',
      isPublic: false,
    });

    expect(constraints).toHaveLength(2);
  });

  it('scopes collaborator queries by listId and collaborator membership', () => {
    const constraints = buildListPlaceMembershipAccessConstraints({
      listId: 'list-1',
      userId: 'user-2',
      ownerId: 'owner-1',
      isPublic: false,
    });

    expect(constraints).toHaveLength(2);
  });

  it('scopes public list queries by listId and listIsPublic', () => {
    const constraints = buildListPlaceMembershipAccessConstraints({
      listId: 'list-1',
      userId: 'user-3',
      ownerId: 'owner-1',
      isPublic: true,
    });

    expect(constraints).toHaveLength(2);
  });
});
