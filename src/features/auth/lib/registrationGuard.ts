export const REGISTRATION_IN_PROGRESS_KEY = 'spotsync_registration_in_progress';
// Must stay well above throttled setInterval gaps (up to 60s in background tabs) so a slow
// registration heartbeat cannot expire while register() is still running in another tab.
export const REGISTRATION_STALE_MS = 120_000;
export const REGISTRATION_HEARTBEAT_MS = 15_000;

export interface RegistrationProgress {
  uid: string;
  startedAt: number;
}

export function parseRegistrationProgress(raw: string | null): RegistrationProgress | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as RegistrationProgress;
    if (typeof parsed.uid !== 'string' || typeof parsed.startedAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isRegistrationActiveForUid(
  progress: RegistrationProgress | null,
  uid: string,
  now: number,
  staleMs = REGISTRATION_STALE_MS
): boolean {
  if (!progress) return false;
  if (progress.uid !== uid && progress.uid !== 'pending') return false;
  return now - progress.startedAt < staleMs;
}

export function readRegistrationProgress(): RegistrationProgress | null {
  return parseRegistrationProgress(localStorage.getItem(REGISTRATION_IN_PROGRESS_KEY));
}

export function writeRegistrationProgress(uid: string): void {
  const payload: RegistrationProgress = { uid, startedAt: Date.now() };
  localStorage.setItem(REGISTRATION_IN_PROGRESS_KEY, JSON.stringify(payload));
}

export function clearRegistrationProgress(): void {
  localStorage.removeItem(REGISTRATION_IN_PROGRESS_KEY);
}

export function isRegistrationInProgress(uid: string, now = Date.now()): boolean {
  return isRegistrationActiveForUid(readRegistrationProgress(), uid, now);
}
