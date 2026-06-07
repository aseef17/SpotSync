import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REGISTRATION_HEARTBEAT_MS,
  REGISTRATION_IN_PROGRESS_KEY,
  REGISTRATION_SESSION_COUNT_KEY,
  REGISTRATION_STALE_MS,
  beginRegistrationSession,
  clearRegistrationProgress,
  endRegistrationSession,
  isRegistrationActiveForUid,
  isRegistrationInProgress,
  isUsernameOwnedByUid,
  parseRegistrationProgress,
  reconcileRegistrationSessionCount,
  shouldDeleteAuthUserOnRegistrationFailure,
  writeRegistrationProgress,
} from './registrationGuard';

const registrationKey = (uid: string): string => `${REGISTRATION_IN_PROGRESS_KEY}:${uid}`;

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

describe('registrationGuard', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('parses a valid registration progress payload', () => {
    const raw = JSON.stringify({ uid: 'user-1', startedAt: 1_000 });
    expect(parseRegistrationProgress(raw)).toEqual({ uid: 'user-1', startedAt: 1_000 });
  });

  it('treats malformed payloads as inactive', () => {
    expect(parseRegistrationProgress('pending')).toBeNull();
    expect(parseRegistrationProgress('{"uid":"x"}')).toBeNull();
  });

  it('matches pending flags for any uid while fresh', () => {
    const progress = { uid: 'pending', startedAt: 1_000 };
    expect(isRegistrationActiveForUid(progress, 'user-1', 1_000 + 30_000)).toBe(true);
  });

  it('expires stale flags so crash recovery can proceed', () => {
    const progress = { uid: 'user-1', startedAt: 1_000 };
    const now = 1_000 + REGISTRATION_STALE_MS;
    expect(isRegistrationActiveForUid(progress, 'user-1', now)).toBe(false);
  });

  it('ignores flags for a different uid', () => {
    const progress = { uid: 'user-2', startedAt: 1_000 };
    expect(isRegistrationActiveForUid(progress, 'user-1', 1_000 + 1_000)).toBe(false);
  });

  it('keeps stale window wider than throttled heartbeat gaps', () => {
    const maxThrottledHeartbeatGapMs = 60_000;
    expect(REGISTRATION_STALE_MS).toBeGreaterThan(maxThrottledHeartbeatGapMs);
    expect(REGISTRATION_STALE_MS).toBeGreaterThan(2 * REGISTRATION_HEARTBEAT_MS);
  });

  it('stores registration progress per uid without overwriting other signups', () => {
    writeRegistrationProgress('user-a');
    writeRegistrationProgress('user-b');

    expect(localStorage.getItem(registrationKey('user-a'))).toContain('user-a');
    expect(localStorage.getItem(registrationKey('user-b'))).toContain('user-b');
    expect(isRegistrationInProgress('user-a', 5_000)).toBe(true);
    expect(isRegistrationInProgress('user-b', 5_000)).toBe(true);
  });

  it('clears only the completed uid registration flag', () => {
    writeRegistrationProgress('user-a');
    writeRegistrationProgress('user-b');

    clearRegistrationProgress('user-a');

    expect(isRegistrationInProgress('user-a', 5_000)).toBe(false);
    expect(isRegistrationInProgress('user-b', 5_000)).toBe(true);
  });

  it('keeps pending while another signup writes a concrete uid', () => {
    writeRegistrationProgress('pending');
    writeRegistrationProgress('user-a');

    expect(localStorage.getItem(registrationKey('pending'))).not.toBeNull();
    expect(isRegistrationInProgress('user-a', 5_000)).toBe(true);
    expect(isRegistrationInProgress('user-b', 5_000)).toBe(true);
  });

  it('clears pending only when explicitly cleared', () => {
    writeRegistrationProgress('pending');
    writeRegistrationProgress('user-a');

    clearRegistrationProgress('pending');

    expect(localStorage.getItem(registrationKey('pending'))).toBeNull();
    expect(isRegistrationInProgress('user-b', 5_000)).toBe(false);
    expect(isRegistrationInProgress('user-a', 5_000)).toBe(true);
  });

  it('tracks cross-tab registration sessions so pending survives unrelated tab completion', () => {
    writeRegistrationProgress('pending');
    beginRegistrationSession();
    beginRegistrationSession();

    endRegistrationSession();

    expect(localStorage.getItem(REGISTRATION_SESSION_COUNT_KEY)).toBe('1');
    expect(localStorage.getItem(registrationKey('pending'))).not.toBeNull();
    expect(isRegistrationInProgress('user-b', 5_000)).toBe(true);
  });

  it('clears pending only after the last cross-tab registration session ends', () => {
    writeRegistrationProgress('pending');
    beginRegistrationSession();
    beginRegistrationSession();

    endRegistrationSession();
    const remainingSessions = endRegistrationSession();

    expect(remainingSessions).toBe(0);
    expect(localStorage.getItem(REGISTRATION_SESSION_COUNT_KEY)).toBeNull();
    clearRegistrationProgress();
    expect(localStorage.getItem(registrationKey('pending'))).toBeNull();
  });

  it('reconciles stale session counts after a crashed tab stops heartbeating', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);

    beginRegistrationSession();
    writeRegistrationProgress('pending');

    vi.setSystemTime(5_000 + REGISTRATION_STALE_MS + 1);
    reconcileRegistrationSessionCount();

    expect(localStorage.getItem(REGISTRATION_SESSION_COUNT_KEY)).toBeNull();
    vi.useRealTimers();
  });

  it('detects when a username reservation belongs to the registering user', () => {
    expect(isUsernameOwnedByUid('user-1', 'user-1')).toBe(true);
    expect(isUsernameOwnedByUid('user-2', 'user-1')).toBe(false);
    expect(isUsernameOwnedByUid(undefined, 'user-1')).toBe(false);
  });

  it('does not roll back auth when orphan recovery already created the profile', () => {
    expect(
      shouldDeleteAuthUserOnRegistrationFailure({
        userProfileExists: true,
        usernameExists: true,
        usernameOwnerUid: 'user-1',
        registeringUid: 'user-1',
      })
    ).toBe(false);
  });

  it('does not roll back auth when the username is already reserved for this user', () => {
    expect(
      shouldDeleteAuthUserOnRegistrationFailure({
        userProfileExists: false,
        usernameExists: true,
        usernameOwnerUid: 'user-1',
        registeringUid: 'user-1',
      })
    ).toBe(false);
  });

  it('rolls back auth when registration failed with no profile and a foreign username owner', () => {
    expect(
      shouldDeleteAuthUserOnRegistrationFailure({
        userProfileExists: false,
        usernameExists: true,
        usernameOwnerUid: 'user-2',
        registeringUid: 'user-1',
      })
    ).toBe(true);
  });
});
