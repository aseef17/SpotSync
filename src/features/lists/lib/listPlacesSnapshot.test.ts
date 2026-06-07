import { describe, expect, it } from 'vitest';
import {
  mergeSubscribedPlaces,
  resolvePlacesSnapshot,
} from '@/features/lists/lib/listPlacesSnapshot';
import type { Place } from '@/features/places/types/place';

const place = (id: string): Place =>
  ({
    id,
    listId: 'list-1',
    name: `Place ${id}`,
    addedAt: new Date(),
  }) as Place;

describe('mergeSubscribedPlaces', () => {
  it('deduplicates subscribed and paginated places by id', () => {
    const subscribed = [place('a'), place('b')];
    const paginated = [place('b'), place('c')];
    expect(mergeSubscribedPlaces(subscribed, paginated)).toEqual([
      subscribed[0],
      subscribed[1],
      paginated[1],
    ]);
  });
});

describe('resolvePlacesSnapshot', () => {
  it('stores snapshots that arrive before list access is confirmed', () => {
    const snapshot = [place('a')];
    expect(
      resolvePlacesSnapshot({
        placesData: snapshot,
        listAccessible: false,
        cancelled: false,
        pendingSnapshot: undefined,
      })
    ).toEqual({ pendingSnapshot: snapshot, shouldApply: false });
  });

  it('applies snapshots once list access is confirmed', () => {
    expect(
      resolvePlacesSnapshot({
        placesData: [place('a')],
        listAccessible: true,
        cancelled: false,
        pendingSnapshot: undefined,
      })
    ).toEqual({ pendingSnapshot: undefined, shouldApply: true });
  });

  it('ignores cancelled subscription work', () => {
    expect(
      resolvePlacesSnapshot({
        placesData: [place('a')],
        listAccessible: true,
        cancelled: true,
        pendingSnapshot: undefined,
      })
    ).toEqual({ pendingSnapshot: undefined, shouldApply: false });
  });
});
