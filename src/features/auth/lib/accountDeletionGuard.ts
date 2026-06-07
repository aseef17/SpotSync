import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * True when deleteAccount has started for this uid. Tombstones block orphan recovery
 * while a stale ID token may still be valid after auth deletion (up to ~1 hour).
 * Cloud Functions prune completed markers after 48 hours.
 */
export async function isAccountDeletionInProgress(uid: string): Promise<boolean> {
  try {
    const markerDoc = await getDoc(doc(db, 'accountDeletions', uid));
    return markerDoc.exists();
  } catch {
    // Fail closed: avoid recreating a profile while deletion state is unknown.
    return true;
  }
}

/** True only when the tombstone doc positively exists; false when absent or lookup fails. */
export async function hasConfirmedAccountDeletionTombstone(uid: string): Promise<boolean> {
  try {
    const markerDoc = await getDoc(doc(db, 'accountDeletions', uid));
    return markerDoc.exists();
  } catch {
    return false;
  }
}

/** Ignore cached or stale profile docs while accountDeletions/{uid} tombstone exists. */
export async function resolveProfileUnlessDeletionPending<T>(
  uid: string,
  profile: T | null
): Promise<T | null> {
  if (!profile) {
    return null;
  }
  if (await isAccountDeletionInProgress(uid)) {
    return null;
  }
  return profile;
}
