import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  getZonedMinutesFromMidnight,
  getZonedWeekdayName,
} from '@/features/places/utils/placeTimeUtils';

describe('placeTimeUtils', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the weekday name in the place timezone', () => {
    vi.useFakeTimers();
    // 2026-06-07 05:13 UTC is 01:13 Sunday morning in America/New_York (EDT).
    vi.setSystemTime(new Date('2026-06-07T05:13:00Z'));

    expect(getZonedWeekdayName('America/New_York')).toBe('Sunday');
  });

  it('returns local minutes from midnight in the place timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T05:13:00Z'));

    expect(getZonedMinutesFromMidnight('America/New_York')).toBe(73);
  });
});
