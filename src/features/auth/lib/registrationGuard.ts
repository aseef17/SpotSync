export const REGISTRATION_IN_PROGRESS_KEY = 'spotsync_registration_in_progress';
// Must stay well above throttled setInterval gaps (up to 60s in background tabs) so a slow
// registration heartbeat cannot expire while register() is still running in another tab.
export const REGISTRATION_STALE_MS = 120_000;
export const REGISTRATION_HEARTBEAT_MS = 15_000;

export interface RegistrationProgress {
  uid: string;
  startedAt: number;
}

const registrationKey = (uid: string): string => `${REGISTRATION_IN_PROGRESS_KEY}:${uid}`;

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

function readRegistrationProgressForUid(uid: string): RegistrationProgress | null {
  return parseRegistrationProgress(localStorage.getItem(registrationKey(uid)));
}

function readLegacyRegistrationProgress(): RegistrationProgress | null {
  return parseRegistrationProgress(localStorage.getItem(REGISTRATION_IN_PROGRESS_KEY));
}

export function readRegistrationProgress(): RegistrationProgress | null {
  return readLegacyRegistrationProgress();
}

export function writeRegistrationProgress(uid: string): void {
  const payload: RegistrationProgress = { uid, startedAt: Date.now() };
  localStorage.setItem(registrationKey(uid), JSON.stringify(payload));
  // One registration flag per uid so parallel signups in different tabs do not overwrite each other.
  localStorage.removeItem(REGISTRATION_IN_PROGRESS_KEY);
  if (uid !== 'pending') {
    localStorage.removeItem(registrationKey('pending'));
  }
}

export function clearRegistrationProgress(uid?: string): void {
  if (uid) {
    localStorage.removeItem(registrationKey(uid));
    if (uid !== 'pending') {
      localStorage.removeItem(registrationKey('pending'));
    }
    return;
  }

  localStorage.removeItem(REGISTRATION_IN_PROGRESS_KEY);
  localStorage.removeItem(registrationKey('pending'));
}

export function isRegistrationInProgress(uid: string, now = Date.now()): boolean {
  const ownProgress = readRegistrationProgressForUid(uid);
  if (isRegistrationActiveForUid(ownProgress, uid, now)) {
    return true;
  }

  const pendingProgress = readRegistrationProgressForUid('pending');
  if (isRegistrationActiveForUid(pendingProgress, uid, now)) {
    return true;
  }

  const legacyProgress = readLegacyRegistrationProgress();
  return isRegistrationActiveForUid(legacyProgress, uid, now);
}
