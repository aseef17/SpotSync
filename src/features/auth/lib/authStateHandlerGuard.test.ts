import { afterEach, describe, expect, it } from 'vitest';
import {
  beginAuthStateHandler,
  isCurrentAuthStateHandler,
  resetAuthStateHandlerGuardForTests,
  shouldRetainUserOnAuthChange,
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

  it('drops the hydrated user when Firebase auth switches accounts', () => {
    expect(shouldRetainUserOnAuthChange('user-a', 'user-b')).toBe(false);
    expect(shouldRetainUserOnAuthChange('user-a', 'user-a')).toBe(true);
    expect(shouldRetainUserOnAuthChange(undefined, 'user-b')).toBe(false);
  });
});
