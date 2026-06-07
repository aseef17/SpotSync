export const INITIAL_CACHE_HYDRATION_COPY = {
  title: 'Caching locally',
  message:
    'Saving your data for faster loads. We keep it synced in the background — this only happens once.',
} as const;

export const INITIAL_CACHE_HYDRATION_MAX_MS = 45_000;

const HYDRATION_COMPLETE_STORAGE_KEY = 'spotsync:initialCacheHydration:v1';

function readCompletedHydrationScopes(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(HYDRATION_COMPLETE_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

export function isScopeHydrationComplete(scopeKey: string): boolean {
  return readCompletedHydrationScopes().has(scopeKey);
}

export function markScopeHydrationComplete(scopeKey: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const completed = readCompletedHydrationScopes();
    if (completed.has(scopeKey)) {
      return;
    }

    completed.add(scopeKey);
    window.localStorage.setItem(HYDRATION_COMPLETE_STORAGE_KEY, JSON.stringify([...completed]));
  } catch {
    // Ignore quota or private-mode storage errors.
  }
}

/** Clears persisted hydration marks when the local cache runtime is reset (logout / account switch). */
export function clearCompletedHydrationScopes(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(HYDRATION_COMPLETE_STORAGE_KEY);
  } catch {
    // Ignore private-mode storage errors.
  }
}

export function resolveHydrationScopeKey(pathname: string): string | null {
  if (pathname === '/dashboard' || pathname === '/') {
    return 'dashboard';
  }
  if (pathname === '/settings') {
    return 'settings';
  }

  const listMatch = pathname.match(/^\/list\/([^/]+)/);
  if (listMatch) {
    return `list:${listMatch[1]}`;
  }

  return null;
}

/** True only for first-time local cache build — not routine Firestore sync or cache probes. */
export function isInitialCacheHydrating(options: {
  hadCacheInitially: boolean | null;
  isLoading: boolean;
  hasContent: boolean;
  waitForPhotoWarm: boolean;
  photoWarmInFlight: number;
  forcedComplete?: boolean;
  scopeAlreadyHydrated?: boolean;
}): boolean {
  if (options.forcedComplete || options.scopeAlreadyHydrated) {
    return false;
  }

  // Only show the overlay when we have confirmed the local cache was empty on first visit.
  // null = probe still running; true = cache already existed — neither is first-time hydration.
  if (options.hadCacheInitially !== false) {
    return false;
  }

  if (options.isLoading) {
    return true;
  }

  if (!options.hasContent) {
    return false;
  }

  if (options.waitForPhotoWarm && options.photoWarmInFlight > 0) {
    return true;
  }

  return false;
}
