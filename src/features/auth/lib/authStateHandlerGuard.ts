let authStateGeneration = 0;

export function beginAuthStateHandler(): number {
  authStateGeneration += 1;
  return authStateGeneration;
}

export function isCurrentAuthStateHandler(generation: number): boolean {
  return generation === authStateGeneration;
}

export function shouldRetainUserOnAuthChange(
  previousUserId: string | undefined,
  nextFirebaseUid: string
): boolean {
  return previousUserId === nextFirebaseUid;
}

export function isAccountSwitchOnSignIn(
  lastAuthenticatedUid: string | null,
  nextFirebaseUid: string
): boolean {
  return Boolean(lastAuthenticatedUid && lastAuthenticatedUid !== nextFirebaseUid);
}

/** Abort auth-scoped local resets when Firebase auth uid changes mid-reset (e.g. cross-tab sign-in). */
export function shouldAbortResetForAuthUidChange(
  uidAtResetStart: string | null,
  currentUid: string | null
): boolean {
  return currentUid !== uidAtResetStart;
}

/** Abort sign-out local reset when auth signs back in or the handler was superseded. */
export function shouldAbortSignOutLocalReset(
  handlerGeneration: number,
  currentUid: string | null
): boolean {
  return (
    !isCurrentAuthStateHandler(handlerGeneration) ||
    shouldAbortResetForAuthUidChange(null, currentUid)
  );
}

export function resetAuthStateHandlerGuardForTests(): void {
  authStateGeneration = 0;
}
