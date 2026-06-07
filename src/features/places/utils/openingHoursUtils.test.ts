import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPlaceOpen } from '@/features/places/utils/placeHelpers';
import {
  isOpenAtTimeFromHoursText,
  normalizeOpeningHours,
  normalizeOpeningHoursLine,
} from '@/features/places/utils/openingHoursUtils';
import type { Place } from '@/features/places/types/place';

describe('normalizeOpeningHours', () => {
  it('assumes PM for a start time when only the end has PM', () => {
    expect(normalizeOpeningHoursLine('Monday: 3:00 - 10:00 PM')).toBe('Monday: 3:00 PM - 10:00 PM');
  });

  it('leaves lines with explicit meridiems unchanged', () => {
    expect(normalizeOpeningHoursLine('Monday: 9:00 AM - 5:00 PM')).toBe(
      'Monday: 9:00 AM - 5:00 PM'
    );
  });

  it('normalizes every weekday line in an array', () => {
    expect(normalizeOpeningHours(['Tuesday: 3:00 - 10:00 PM', 'Wednesday: Closed'])).toEqual([
      'Tuesday: 3:00 PM - 10:00 PM',
      'Wednesday: Closed',
    ]);
  });

  it('does not infer PM when the start hour is after the end hour', () => {
    expect(normalizeOpeningHoursLine('Monday: 11:00 - 2:00 PM')).toBe('Monday: 11:00 - 2:00 PM');
  });
});

describe('isOpenAtTimeFromHoursText', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats ambiguous start times as PM when the end is PM', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T16:00:00'));

    expect(isOpenAtTimeFromHoursText('3:00 - 10:00 PM')).toBe(true);
  });

  it('returns false before an afternoon PM range opens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T14:00:00'));

    expect(isOpenAtTimeFromHoursText('3:00 - 10:00 PM')).toBe(false);
  });

  it('treats ambiguous lunch hours as AM start, not overnight PM', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T12:00:00'));

    expect(isOpenAtTimeFromHoursText('11:00 - 2:00 PM')).toBe(true);
  });

  it('does not mark lunch hours open late at night', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T23:30:00'));

    expect(isOpenAtTimeFromHoursText('11:00 - 2:00 PM')).toBe(false);
  });
});

describe('isPlaceOpen with ambiguous PM hours', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('uses inferred PM start when Google hours omit meridiem on the start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T16:00:00'));

    const place = buildPlace({
      openNow: false,
      openingHours: ['Sunday: 3:00 - 10:00 PM'],
    });

    expect(isPlaceOpen(place)).toBe(true);
  });
});
