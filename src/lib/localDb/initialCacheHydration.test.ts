import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCompletedHydrationScopes,
  isInitialCacheHydrating,
  isScopeHydrationComplete,
  markScopeHydrationComplete,
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

  it('does not hydrate while cache probe is pending (routine loading only)', () => {
    expect(
      isInitialCacheHydrating({
        hadCacheInitially: null,
        isLoading: true,
        hasContent: false,
        waitForPhotoWarm: false,
        photoWarmInFlight: 0,
      })
    ).toBe(false);

    expect(
      isInitialCacheHydrating({
        hadCacheInitially: null,
        isLoading: false,
        hasContent: true,
        waitForPhotoWarm: true,
        photoWarmInFlight: 0,
      })
    ).toBe(false);
  });

  it('skips hydration when scope already completed on this device', () => {
    expect(
      isInitialCacheHydrating({
        hadCacheInitially: false,
        isLoading: true,
        hasContent: false,
        waitForPhotoWarm: false,
        photoWarmInFlight: 0,
        scopeAlreadyHydrated: true,
      })
    ).toBe(false);
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

  it('stops hydrating when forced complete', () => {
    expect(
      isInitialCacheHydrating({
        hadCacheInitially: false,
        isLoading: false,
        hasContent: true,
        waitForPhotoWarm: true,
        photoWarmInFlight: 3,
        forcedComplete: true,
      })
    ).toBe(false);
  });

  describe('persisted hydration scopes', () => {
    beforeEach(() => {
      const store = new Map<string, string>();
      const localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      };
      vi.stubGlobal('window', { localStorage });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('clears persisted hydration scopes on runtime reset', () => {
      markScopeHydrationComplete('dashboard');
      expect(isScopeHydrationComplete('dashboard')).toBe(true);

      clearCompletedHydrationScopes();
      expect(isScopeHydrationComplete('dashboard')).toBe(false);
    });
  });
});
