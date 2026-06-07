import { describe, expect, it } from 'vitest';
import { reconcileSavedLists } from '@/features/lists/api/reconcileSavedLists';
import type { PlaceList } from '@/features/lists/types/list';

const savedList = (id: string): PlaceList =>
  ({
    id,
    name: id,
    isSavedList: true,
  }) as PlaceList;

describe('reconcileSavedLists', () => {
  it('replaces saved lists when fetch resolves', () => {
    const result = reconcileSavedLists({
      profileIds: ['a', 'b'],
      ownedIds: new Set(),
      previousSavedLists: [savedList('c')],
      fetched: [savedList('a'), savedList('b')],
      resolved: true,
    });

    expect(result.map((list) => list.id)).toEqual(['a', 'b']);
  });

  it('drops unsaved lists when fetch is unresolved', () => {
    const result = reconcileSavedLists({
      profileIds: ['a', 'b'],
      ownedIds: new Set(),
      previousSavedLists: [savedList('a'), savedList('b'), savedList('c')],
      fetched: [],
      resolved: false,
    });

    expect(result.map((list) => list.id)).toEqual(['a', 'b']);
  });

  it('merges partial fetch results while pruning removed profile ids', () => {
    const result = reconcileSavedLists({
      profileIds: ['a', 'b', 'd'],
      ownedIds: new Set(),
      previousSavedLists: [savedList('a'), savedList('b'), savedList('c')],
      fetched: [savedList('d')],
      resolved: false,
    });

    expect(result.map((list) => list.id)).toEqual(['a', 'b', 'd']);
  });

  it('does not keep owned lists in the saved-list bucket', () => {
    const result = reconcileSavedLists({
      profileIds: ['owned', 'saved'],
      ownedIds: new Set(['owned']),
      previousSavedLists: [savedList('owned'), savedList('saved')],
      fetched: [],
      resolved: false,
    });

    expect(result.map((list) => list.id)).toEqual(['saved']);
  });
});
