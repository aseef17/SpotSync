import { describe, expect, it } from 'vitest';
import type { Place } from '@/features/places/types/place';
import type { PendingMutation } from '@/lib/localDb/types';
import {
  applyPendingMutationsToPlace,
  applyPendingMutationsToPlaces,
  applyStatusMutationToPlace,
} from '@/lib/localDb/applyPendingOverlay';

const basePlace: Place = {
  id: 'place-1',
  listId: 'list-1',
  name: 'Test Place',
  address: '123 Main St',
  location: { lat: 0, lng: 0 },
  status: 'not_visited',
  addedBy: 'user-1',
  addedAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('applyPendingOverlay', () => {
  it('applies only the latest queued status for a place', () => {
    const mutations: PendingMutation[] = [
      {
        id: 'updatePlaceStatus:place-1',
        type: 'updatePlaceStatus',
        entityId: 'place-1',
        payload: {
          placeId: 'place-1',
          status: 'visited',
        },
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'updatePlaceStatus:place-1',
        type: 'updatePlaceStatus',
        entityId: 'place-1',
        payload: {
          placeId: 'place-1',
          status: 'custom',
          customValue: 'Favorite',
        },
        createdAt: 1,
        updatedAt: 3,
      },
    ];

    const [updated] = applyPendingMutationsToPlaces([basePlace], [mutations[1]]);
    expect(updated.status).toBe('custom');
    expect(updated.customStatus).toBe('Favorite');
  });

  it('keeps other places unchanged when overlaying one place', () => {
    const otherPlace: Place = { ...basePlace, id: 'place-2', name: 'Other' };
    const mutations: PendingMutation[] = [
      {
        id: 'updatePlaceStatus:place-1',
        type: 'updatePlaceStatus',
        entityId: 'place-1',
        payload: {
          placeId: 'place-1',
          status: 'not_going',
        },
        createdAt: 1,
        updatedAt: 2,
      },
    ];

    const result = applyPendingMutationsToPlaces([basePlace, otherPlace], mutations);
    expect(result[0].status).toBe('not_going');
    expect(result[1].status).toBe('not_visited');
  });

  it('clears custom status when switching back to a standard status', () => {
    const customPlace: Place = {
      ...basePlace,
      status: 'custom',
      customStatus: 'Maybe',
    };

    const updated = applyStatusMutationToPlace(customPlace, {
      placeId: 'place-1',
      status: 'visited',
    });

    expect(updated.status).toBe('visited');
    expect(updated.customStatus).toBeUndefined();
  });

  it('applies a single-place overlay', () => {
    const mutations: PendingMutation[] = [
      {
        id: 'updatePlaceStatus:place-1',
        type: 'updatePlaceStatus',
        entityId: 'place-1',
        payload: {
          placeId: 'place-1',
          status: 'visited',
          userId: 'user-2',
        },
        createdAt: 1,
        updatedAt: 2,
      },
    ];

    const updated = applyPendingMutationsToPlace(basePlace, mutations);
    expect(updated.status).toBe('visited');
    expect(updated.updatedBy).toBe('user-2');
  });
});
