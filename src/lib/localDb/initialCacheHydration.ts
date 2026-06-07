export const INITIAL_CACHE_HYDRATION_COPY = {
  title: 'Caching locally',
  message:
    'Saving your data for faster loads. We keep it synced in the background — this only happens once.',
} as const;

export const INITIAL_CACHE_HYDRATION_MAX_MS = 45_000;

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

/** True only for first-time local cache build — not background Firestore sync. */
export function isInitialCacheHydrating(options: {
  hadCacheInitially: boolean | null;
  isLoading: boolean;
  hasContent: boolean;
  waitForPhotoWarm: boolean;
  photoWarmInFlight: number;
  forcedComplete?: boolean;
}): boolean {
  if (options.forcedComplete) {
    return false;
  }

  if (options.hadCacheInitially === true) {
    return false;
  }

  if (options.hadCacheInitially === null) {
    if (options.isLoading) {
      return true;
    }
    if (options.hasContent) {
      return true;
    }
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
