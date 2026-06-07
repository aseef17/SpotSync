import { describe, expect, it } from 'vitest';
import {
  buildGooglePlacePayload,
  buildMembershipPayload,
  resolveCanonicalGooglePlaceId,
  resolveMembershipId,
  splitPlaceUpdates,
} from '@/features/places/utils/placeWriteSplit';

describe('placeWriteSplit', () => {
  it('resolves canonical google place ids', () => {
    expect(resolveCanonicalGooglePlaceId({ googlePlaceId: 'ChIJabc' })).toBe('ChIJabc');
    expect(resolveCanonicalGooglePlaceId({ plusCode: '87G8P2V6+XX' })).toBe('plus_87G8P2V6+XX');
    expect(resolveCanonicalGooglePlaceId({})).toMatch(/^manual_/);
  });

  it('builds composite membership ids', () => {
    expect(resolveMembershipId('list1', 'ChIJabc')).toBe('list1_ChIJabc');
  });

  it('splits membership vs google place updates', () => {
    const { membershipUpdates, googlePlaceUpdates } = splitPlaceUpdates({
      status: 'visited',
      notes: 'Great spot',
      name: 'Updated Name',
      rating: 4.5,
      listOwnerId: 'owner',
    });

    expect(membershipUpdates).toEqual({
      status: 'visited',
      notes: 'Great spot',
    });
    expect(googlePlaceUpdates).toEqual({
      name: 'Updated Name',
      rating: 4.5,
    });
  });

  it('builds google place and membership payloads from place data', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const place = {
      listId: 'list1',
      googlePlaceId: 'ChIJabc',
      name: 'Test Cafe',
      address: '123 Main St',
      location: { lat: 40.7, lng: -74.0 },
      status: 'not_visited' as const,
      addedBy: 'user1',
      notes: 'Try the latte',
      addedAt: now,
      updatedAt: now,
    };

    const googlePlace = buildGooglePlacePayload(place, 'ChIJabc', {
      createdAt: now,
      updatedAt: now,
    });
    const membership = buildMembershipPayload(place, 'list1', 'ChIJabc', 'list1_ChIJabc', {
      addedAt: now,
      updatedAt: now,
    });

    expect(googlePlace.name).toBe('Test Cafe');
    expect(googlePlace.googlePlaceId).toBe('ChIJabc');
    expect(membership.id).toBe('list1_ChIJabc');
    expect(membership.notes).toBe('Try the latte');
    expect(membership.status).toBe('not_visited');
  });

  it('persists suppressNotifications on membership payloads for bulk import', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const place = {
      listId: 'list1',
      googlePlaceId: 'ChIJabc',
      name: 'Test Cafe',
      address: '123 Main St',
      location: { lat: 40.7, lng: -74.0 },
      status: 'not_visited' as const,
      addedBy: 'user1',
      suppressNotifications: true,
      addedAt: now,
      updatedAt: now,
    };

    const membership = buildMembershipPayload(place, 'list1', 'ChIJabc', 'list1_ChIJabc', {
      addedAt: now,
      updatedAt: now,
    });

    expect(membership.suppressNotifications).toBe(true);
  });
});
