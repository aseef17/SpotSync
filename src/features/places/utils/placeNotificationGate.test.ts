import { describe, expect, it } from 'vitest';
import { shouldSkipPlaceAddedNotification } from '@/features/places/utils/placeNotificationGate';

describe('shouldSkipPlaceAddedNotification', () => {
  it('skips when place has suppressNotifications even after import completes', () => {
    expect(
      shouldSkipPlaceAddedNotification({ suppressNotifications: true }, { importInProgress: false })
    ).toBe(true);
  });

  it('skips while bulk import is in progress', () => {
    expect(shouldSkipPlaceAddedNotification({}, { importInProgress: true })).toBe(true);
  });

  it('allows notifications for normal single-place adds', () => {
    expect(shouldSkipPlaceAddedNotification({}, { importInProgress: false })).toBe(false);
  });
});
