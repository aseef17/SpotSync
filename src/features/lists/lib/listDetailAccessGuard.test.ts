import { describe, expect, it } from 'vitest';
import { shouldApplyCachedListDetails } from '@/features/lists/lib/listDetailAccessGuard';

describe('shouldApplyCachedListDetails', () => {
  it('blocks cache hydration after access is revoked', () => {
    expect(shouldApplyCachedListDetails(false, false)).toBe(false);
  });

  it('allows cache hydration while the list remains accessible', () => {
    expect(shouldApplyCachedListDetails(true, false)).toBe(true);
  });

  it('ignores cancelled hydration work', () => {
    expect(shouldApplyCachedListDetails(true, true)).toBe(false);
  });
});
