import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginAuthStateHandler,
  isCurrentAuthStateHandler,
  resetAuthStateHandlerGuardForTests,
} from '@/features/auth/lib/authStateHandlerGuard';

describe('account switch handler guard', () => {
  afterEach(() => {
    resetAuthStateHandlerGuardForTests();
  });

  it('does not overwrite lastAuthenticatedUid when a newer auth handler supersedes reset', async () => {
    let lastAuthenticatedUid: string | null = 'user-a';

    const resetLocalDataRuntime = vi.fn(async () => {
      // Simulate a rapid A→B→C switch where the latest handler finishes first.
      lastAuthenticatedUid = 'user-c';
    });

    const staleGeneration = beginAuthStateHandler();
    beginAuthStateHandler();

    const staleUser = { uid: 'user-b' } as const;

    if (lastAuthenticatedUid && lastAuthenticatedUid !== staleUser.uid) {
      await resetLocalDataRuntime({ skipPendingFlush: true });
      if (!isCurrentAuthStateHandler(staleGeneration)) {
        return;
      }
    }

    lastAuthenticatedUid = staleUser.uid;

    expect(resetLocalDataRuntime).toHaveBeenCalledWith({ skipPendingFlush: true });
    expect(lastAuthenticatedUid).toBe('user-c');
  });
});
