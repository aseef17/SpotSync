import { describe, expect, it } from 'vitest';
import { mergeOwnedAndSavedLists } from '@/features/lists/api/mergeOwnedAndSavedLists';
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
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    ...overrides,
  }) as PlaceList;

describe('mergeOwnedAndSavedLists', () => {
  it('drops stale private saved lists after collaborator access is revoked', () => {
    const staleSaved = list({ isSavedList: true });

    expect(mergeOwnedAndSavedLists([], [staleSaved])).toEqual([]);
  });

  it('keeps public saved lists that are not in the live query', () => {
    const publicSaved = list({
      isSavedList: true,
      isPublic: true,
      collaboratorIds: [],
    });

    expect(mergeOwnedAndSavedLists([], [publicSaved])).toEqual([publicSaved]);
  });

  it('prefers live owned/collaborator rows over duplicate saved entries', () => {
    const live = list({ updatedAt: new Date('2026-01-03') });
    const savedDuplicate = list({ isSavedList: true, updatedAt: new Date('2026-01-01') });

    expect(mergeOwnedAndSavedLists([live], [savedDuplicate])).toEqual([live]);
  });
});
