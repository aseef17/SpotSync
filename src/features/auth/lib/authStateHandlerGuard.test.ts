import { afterEach, describe, expect, it } from 'vitest';
import {
  beginAuthStateHandler,
  isCurrentAuthStateHandler,
  resetAuthStateHandlerGuardForTests,
} from '@/features/auth/lib/authStateHandlerGuard';

describe('authStateHandlerGuard', () => {
  afterEach(() => {
    resetAuthStateHandlerGuardForTests();
  });

  it('marks only the latest auth handler as current', () => {
    const first = beginAuthStateHandler();
    const second = beginAuthStateHandler();

    expect(isCurrentAuthStateHandler(first)).toBe(false);
    expect(isCurrentAuthStateHandler(second)).toBe(true);
  });
});
