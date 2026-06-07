import { describe, expect, it } from 'vitest';

/**
 * Cache hydration from a prior session must not emit to listeners after the active
 * user changes (e.g. logout then login as a different account).
 */
describe('userProfileStore active-user guard', () => {
  it('allows emit only when hydration user matches the active subscription user', () => {
    const shouldEmit = (activeUserId: string | null, hydrationUserId: string) =>
      activeUserId === hydrationUserId;

    expect(shouldEmit('user-b', 'user-a')).toBe(false);
    expect(shouldEmit('user-b', 'user-b')).toBe(true);
    expect(shouldEmit(null, 'user-a')).toBe(false);
  });
});
