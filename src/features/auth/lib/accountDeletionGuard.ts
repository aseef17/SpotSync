import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * True when deleteAccount has started for this uid. Markers are kept permanently as
 * tombstones so orphan recovery cannot run while a stale ID token is still valid after
 * auth deletion (tokens can remain usable for up to an hour).
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
