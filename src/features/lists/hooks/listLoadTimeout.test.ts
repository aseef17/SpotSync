import { describe, expect, it } from 'vitest';
import { shouldSetSlowListLoadError } from './listLoadTimeout';

describe('shouldSetSlowListLoadError', () => {
  it('sets a blocking error only when list metadata is still missing', () => {
    expect(shouldSetSlowListLoadError(false)).toBe(true);
    expect(shouldSetSlowListLoadError(true)).toBe(false);
  });
});
