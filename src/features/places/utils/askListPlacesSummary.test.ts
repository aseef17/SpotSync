import { describe, expect, it } from 'vitest';
import { buildAskListPlacesSummary } from '@/features/places/utils/askListPlacesSummary';
import type { Place } from '@/features/places/types/place';

const samplePlace = (id: string): Place => ({
  id,
  listId: 'list-1',
  name: `Place ${id}`,
  address: '123 Main St',
  location: { lat: 0, lng: 0 },
  addedBy: 'user-1',
  status: 'not_visited',
  addedAt: new Date(),
  updatedAt: new Date(),
});

describe('buildAskListPlacesSummary', () => {
  it('returns undefined when more places remain unloaded', () => {
    expect(buildAskListPlacesSummary([samplePlace('a')], true)).toBeUndefined();
  });

  it('returns a summary when the full list is loaded locally', () => {
    expect(buildAskListPlacesSummary([samplePlace('a')], false)).toEqual([
      {
        id: 'a',
        name: 'Place a',
        notes: undefined,
        category: undefined,
        status: 'not_visited',
        address: '123 Main St',
      },
    ]);
  });
});
