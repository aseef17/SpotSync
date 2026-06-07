import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPlaceOpen } from '@/features/places/utils/placeHelpers';
import type { Place } from '@/features/places/types/place';

function buildPlace(overrides: Partial<Place>): Place {
  return {
    id: 'place-1',
    name: 'Test Place',
    address: '123 Main St',
    listId: 'list-1',
    location: { lat: 40.7, lng: -74.0 },
    status: 'not_visited',
    addedBy: 'user-1',
    addedAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('isPlaceOpen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefers parsed today hours over a stale openNow snapshot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T04:41:00'));

    const place = buildPlace({
      openNow: true,
      openingHours: ['Sunday: 7:00 AM – 11:00 PM'],
    });

    expect(isPlaceOpen(place)).toBe(false);
  });

  it('returns false when today is explicitly closed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T04:41:00'));

    const place = buildPlace({
      openNow: true,
      openingHours: ['Sunday: Closed'],
    });

    expect(isPlaceOpen(place)).toBe(false);
  });

  it('returns true when current time falls within today hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T12:00:00'));

    const place = buildPlace({
      openNow: false,
      openingHours: ['Sunday: 7:00 AM – 11:00 PM'],
    });

    expect(isPlaceOpen(place)).toBe(true);
  });
});
