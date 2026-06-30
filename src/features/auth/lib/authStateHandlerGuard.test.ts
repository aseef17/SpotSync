import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginAuthStateHandler,
  isCurrentAuthStateHandler,
  readPersistedLastAuthenticatedUid,
  resetAuthStateHandlerGuardForTests,
  isAccountSwitchOnSignIn,
  shouldAbortResetForAuthUidChange,
  shouldAbortSignOutLocalReset,
  shouldRetainUserOnAuthChange,
  writePersistedLastAuthenticatedUid,
} from '@/features/auth/lib/authStateHandlerGuard';

describe('authStateHandlerGuard', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  afterEach(() => {
    resetAuthStateHandlerGuardForTests();
    vi.unstubAllGlobals();
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

  it('persists the last authenticated uid across reloads for account-switch detection', () => {
    writePersistedLastAuthenticatedUid('user-a');
    expect(readPersistedLastAuthenticatedUid()).toBe('user-a');
    expect(isAccountSwitchOnSignIn(readPersistedLastAuthenticatedUid(), 'user-b')).toBe(true);

    writePersistedLastAuthenticatedUid(null);
    expect(readPersistedLastAuthenticatedUid()).toBeNull();
  });

  it('aborts auth-scoped local reset when Firebase uid changes mid-reset', () => {
    expect(shouldAbortResetForAuthUidChange('user-a', 'user-a')).toBe(false);
    expect(shouldAbortResetForAuthUidChange('user-a', 'user-b')).toBe(true);
    expect(shouldAbortResetForAuthUidChange('user-a', null)).toBe(true);
  });

  it('aborts sign-out local reset when auth signs back in or handler is superseded', () => {
    const handlerGeneration = beginAuthStateHandler();

    expect(shouldAbortSignOutLocalReset(handlerGeneration, null)).toBe(false);
    expect(shouldAbortSignOutLocalReset(handlerGeneration, 'user-b')).toBe(true);

    beginAuthStateHandler();
    expect(shouldAbortSignOutLocalReset(handlerGeneration, null)).toBe(true);
  });
});
