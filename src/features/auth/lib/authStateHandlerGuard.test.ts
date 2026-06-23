import { afterEach, describe, expect, it } from 'vitest';
import {
  beginAuthStateHandler,
  isAccountSwitch,
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

  it('detects account switch only when a prior authenticated uid is still recorded', () => {
    expect(isAccountSwitch('user-a', 'user-b')).toBe(true);
    expect(isAccountSwitch('user-a', 'user-a')).toBe(false);
    expect(isAccountSwitch(null, 'user-b')).toBe(false);
  });
});
