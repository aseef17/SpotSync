import { describe, expect, it } from 'vitest';
import { canApplyCachedListData } from '@/features/lists/hooks/listDetailsAccess';

describe('canApplyCachedListData', () => {
  it('blocks cache hydration after list access is denied', () => {
    expect(canApplyCachedListData({ cancelled: false, listAccessible: false })).toBe(false);
  });

  it('blocks cache hydration when the effect has been cleaned up', () => {
    expect(canApplyCachedListData({ cancelled: true, listAccessible: true })).toBe(false);
  });

  it('allows cache hydration while list access is confirmed', () => {
    expect(canApplyCachedListData({ cancelled: false, listAccessible: true })).toBe(true);
  });
});
