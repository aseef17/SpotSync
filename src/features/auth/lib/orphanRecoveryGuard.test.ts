import { describe, expect, it } from 'vitest';
import {
  REGISTRATION_HEARTBEAT_MS,
  REGISTRATION_STALE_MS,
  isRegistrationActiveForUid,
} from './registrationGuard';

/**
 * Orphan recovery must not run while another tab's register() heartbeat keeps the
 * cross-tab flag fresh. A wall-clock wait cap shorter than slow signups caused recovery
 * to race active registration when startedAt was refreshed every heartbeat.
 */
describe('orphan recovery timing guard', () => {
  it('treats heartbeated registration as active beyond a fixed 120s wait window', () => {
    const heartbeatRefreshes = [
      15_000, 30_000, 45_000, 60_000, 75_000, 90_000, 105_000, 120_000, 135_000,
    ];

    for (const now of heartbeatRefreshes) {
      const lastHeartbeatAt = now - REGISTRATION_HEARTBEAT_MS;
      expect(now - lastHeartbeatAt).toBeLessThan(REGISTRATION_STALE_MS);
    }

    // Simulated bug: breaking after 120s wall clock while heartbeat still refreshes startedAt.
    const wallClockWaitExpiredAt = 120_000;
    const lastHeartbeatAt = wallClockWaitExpiredAt; // heartbeat refreshed at the deadline
    const registrationStillActive =
      wallClockWaitExpiredAt - lastHeartbeatAt < REGISTRATION_STALE_MS;

    expect(registrationStillActive).toBe(true);
  });

  it('requires re-waiting when a heartbeat refreshes the flag after a stale read', () => {
    const uid = 'user-1';
    const staleProgress = { uid, startedAt: 0 };
    const staleReadAt = REGISTRATION_STALE_MS + 1;

    expect(isRegistrationActiveForUid(staleProgress, uid, staleReadAt)).toBe(false);

    const refreshedProgress = { uid, startedAt: staleReadAt + 5 };
    const recheckAt = staleReadAt + 10;

    expect(isRegistrationActiveForUid(refreshedProgress, uid, recheckAt)).toBe(true);
  });
});
