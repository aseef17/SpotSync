export const INITIAL_CACHE_HYDRATION_COPY = {
  title: 'Caching locally',
  message:
    'Saving your data for faster loads. We keep it synced in the background — this only happens once.',
} as const;

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
}): boolean {
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
