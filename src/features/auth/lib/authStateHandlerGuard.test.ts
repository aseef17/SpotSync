import { afterEach, describe, expect, it } from 'vitest';
import {
  beginAuthStateHandler,
  isAccountSwitchOnSignIn,
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

  it('detects account switch while logout reset is still in flight', () => {
    // Logout must not clear lastAuthenticatedUid until reset completes; otherwise a
    // superseded logout handler that aborts reset leaves no signal for the next sign-in.
    expect(isAccountSwitchOnSignIn('user-a', 'user-b')).toBe(true);
    expect(isAccountSwitchOnSignIn(null, 'user-b')).toBe(false);
    expect(isAccountSwitchOnSignIn('user-a', 'user-a')).toBe(false);
  });
});
