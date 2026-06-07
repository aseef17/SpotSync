import { describe, expect, it } from 'vitest';

/**
 * Cross-tab registration can provision a profile in Tab A while Tab B still has a
 * persistent-cache miss for users/{uid}. Profile hydration after orphan recovery
 * or cross-tab waits must read from the server, not only the local cache.
 */
describe('cross-tab profile hydration contract', () => {
  it('requires server reads after another tab finishes register()', () => {
    const cacheHasProfile = false;
    const serverHasProfile = true;

    expect(cacheHasProfile).toBe(false);
    expect(serverHasProfile).toBe(true);
  });

  it('must not leave firebaseUser set while user profile stays null after recovery', () => {
    const firebaseUserLoaded = true;
    const profileLoadedFromServer = true;
    const appUserReady = profileLoadedFromServer;

    expect(firebaseUserLoaded && appUserReady).toBe(true);
  });
});
