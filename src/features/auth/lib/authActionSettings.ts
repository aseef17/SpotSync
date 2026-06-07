import type { ActionCodeSettings } from 'firebase/auth';

/**
 * Continue URL for Firebase Auth email links (verification, password reset).
 * Must be listed under Firebase Console → Authentication → Settings → Authorized domains.
 */
export function getAuthActionCodeSettings(): ActionCodeSettings {
  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://spotsync.app';

  return {
    url: `${origin}/login`,
    handleCodeInApp: true,
  };
}
