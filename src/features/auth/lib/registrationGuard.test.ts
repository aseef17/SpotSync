import { describe, expect, it } from 'vitest';
import {
  REGISTRATION_STALE_MS,
  isRegistrationActiveForUid,
  parseRegistrationProgress,
} from './registrationGuard';

describe('registrationGuard', () => {
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
});
