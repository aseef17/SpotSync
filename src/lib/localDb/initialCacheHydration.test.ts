import { describe, expect, it } from 'vitest';
import {
  isInitialCacheHydrating,
  resolveHydrationScopeKey,
} from '@/lib/localDb/initialCacheHydration';

describe('initialCacheHydration', () => {
  it('resolves scope keys from routes', () => {
    expect(resolveHydrationScopeKey('/dashboard')).toBe('dashboard');
    expect(resolveHydrationScopeKey('/settings')).toBe('settings');
    expect(resolveHydrationScopeKey('/list/abc123')).toBe('list:abc123');
    expect(resolveHydrationScopeKey('/login')).toBeNull();
  });

  it('hydrates only when cache was empty on first visit', () => {
    expect(
      isInitialCacheHydrating({
        hadCacheInitially: true,
        isLoading: true,
        hasContent: false,
        waitForPhotoWarm: false,
        photoWarmInFlight: 0,
      })
    ).toBe(false);

    expect(
      isInitialCacheHydrating({
        hadCacheInitially: false,
        isLoading: true,
        hasContent: false,
        waitForPhotoWarm: false,
        photoWarmInFlight: 0,
      })
    ).toBe(true);
  });

  it('stops hydrating for empty lists once loading finishes', () => {
    expect(
      isInitialCacheHydrating({
        hadCacheInitially: false,
        isLoading: false,
        hasContent: false,
        waitForPhotoWarm: false,
        photoWarmInFlight: 0,
      })
    ).toBe(false);
  });

  it('waits for photo warm only on first list load', () => {
    expect(
      isInitialCacheHydrating({
        hadCacheInitially: false,
        isLoading: false,
        hasContent: true,
        waitForPhotoWarm: true,
        photoWarmInFlight: 2,
      })
    ).toBe(true);

    expect(
      isInitialCacheHydrating({
        hadCacheInitially: false,
        isLoading: false,
        hasContent: true,
        waitForPhotoWarm: true,
        photoWarmInFlight: 0,
      })
    ).toBe(false);
  });
});
