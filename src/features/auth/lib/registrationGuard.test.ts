import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REGISTRATION_HEARTBEAT_MS,
  REGISTRATION_IN_PROGRESS_KEY,
  REGISTRATION_STALE_MS,
  clearRegistrationProgress,
  decrementRegistrationTabCount,
  getRegistrationTabCount,
  incrementRegistrationTabCount,
  isRegistrationActiveForUid,
  isRegistrationInProgress,
  parseRegistrationProgress,
  writeRegistrationProgress,
} from './registrationGuard';

const registrationKey = (uid: string): string => `${REGISTRATION_IN_PROGRESS_KEY}:${uid}`;

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
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

  it('keeps pending when a concrete uid is written for another signup', () => {
    writeRegistrationProgress('pending');
    writeRegistrationProgress('user-a');

    expect(localStorage.getItem(registrationKey('pending'))).not.toBeNull();
    expect(isRegistrationInProgress('user-a', 5_000)).toBe(true);
    expect(isRegistrationInProgress('user-b', 5_000)).toBe(true);
  });

  it('does not clear pending when clearing a concrete uid', () => {
    writeRegistrationProgress('pending');
    writeRegistrationProgress('user-a');

    clearRegistrationProgress('user-a');

    expect(localStorage.getItem(registrationKey('pending'))).not.toBeNull();
    expect(isRegistrationInProgress('user-b', 5_000)).toBe(true);
  });

  it('tracks cross-tab registration count', () => {
    expect(getRegistrationTabCount()).toBe(0);

    incrementRegistrationTabCount();
    incrementRegistrationTabCount();
    expect(getRegistrationTabCount()).toBe(2);

    expect(decrementRegistrationTabCount()).toBe(1);
    expect(getRegistrationTabCount()).toBe(1);

    expect(decrementRegistrationTabCount()).toBe(0);
    expect(getRegistrationTabCount()).toBe(0);
  });

  it('does not underflow cross-tab registration count', () => {
    expect(decrementRegistrationTabCount()).toBe(0);
    expect(getRegistrationTabCount()).toBe(0);
  });

  it('keeps pending while another tab registration is still active', () => {
    writeRegistrationProgress('pending');
    incrementRegistrationTabCount();
    incrementRegistrationTabCount();

    writeRegistrationProgress('user-a');
    decrementRegistrationTabCount();
    clearRegistrationProgress('user-a');

    expect(getRegistrationTabCount()).toBe(1);
    expect(localStorage.getItem(registrationKey('pending'))).not.toBeNull();
    expect(isRegistrationInProgress('user-b', 5_000)).toBe(true);
  });
});
