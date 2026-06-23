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

/** True when auth uid changes from a previously authenticated session (not first login). */
export function isAccountSwitch(
  lastAuthenticatedUid: string | null,
  nextFirebaseUid: string
): boolean {
  return Boolean(lastAuthenticatedUid && lastAuthenticatedUid !== nextFirebaseUid);
}

export function resetAuthStateHandlerGuardForTests(): void {
  authStateGeneration = 0;
}
