import { describe, expect, it } from 'vitest';
import {
  assertUserCanWriteList,
  getExpectedEditorIds,
  getListPermissionUpdates,
  userCanWriteList,
} from '@/features/lists/utils/listPermissionSync';
import type { PlaceList } from '@/features/lists/types/list';

const baseList: PlaceList = {
  id: 'list-1',
  name: 'Test',
  isPublic: false,
  ownerId: 'owner-1',
  collaborators: [
    {
      userId: 'owner-1',
      username: 'owner',
      email: 'owner@example.com',
      permission: 'owner',
      invitedAt: new Date(),
    },
    {
      userId: 'editor-1',
      username: 'editor',
      email: 'editor@example.com',
      permission: 'editor',
      invitedAt: new Date(),
    },
  ],
  collaboratorIds: ['owner-1'],
  editorIds: ['owner-1'],
  places: [],
  customStatuses: [],
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('listPermissionSync', () => {
  it('detects stale editorIds from collaborators', () => {
    const updates = getListPermissionUpdates(baseList);
    expect(updates?.editorIds).toEqual(['owner-1', 'editor-1']);
    expect(updates?.collaboratorIds).toEqual(['owner-1', 'editor-1']);
  });

  it('returns expected editor ids from collaborator roles', () => {
    expect(getExpectedEditorIds(baseList)).toEqual(['owner-1', 'editor-1']);
  });

  it('blocks sync for collaborators missing from editorIds', () => {
    expect(userCanWriteList(baseList, 'editor-1')).toBe(false);
    expect(() => assertUserCanWriteList(baseList, 'editor-1')).toThrow(
      'You have editor access but this list needs a permission sync'
    );
  });

  it('allows owners and denormalized editors to write', () => {
    const syncedList = { ...baseList, editorIds: ['owner-1', 'editor-1'] };
    expect(userCanWriteList(syncedList, 'owner-1')).toBe(true);
    expect(userCanWriteList(syncedList, 'editor-1')).toBe(true);
    expect(() => assertUserCanWriteList(syncedList, 'editor-1')).not.toThrow();
  });
});
