import { describe, expect, it } from 'vitest';
import { shouldApplyCachedListDetails } from '@/features/lists/lib/listDetailAccessGuard';

describe('shouldApplyCachedListDetails', () => {
  it('allows cache hydration when list access is confirmed', () => {
    expect(shouldApplyCachedListDetails(true, false)).toBe(true);
  });

  it('blocks cache hydration after access is revoked or denied', () => {
    expect(shouldApplyCachedListDetails(false, false)).toBe(false);
  });

  it('blocks cache hydration after the effect is cleaned up', () => {
    expect(shouldApplyCachedListDetails(true, true)).toBe(false);
    expect(shouldApplyCachedListDetails(false, true)).toBe(false);
  });
});
