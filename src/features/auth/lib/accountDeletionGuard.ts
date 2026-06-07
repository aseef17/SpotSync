import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** True when deleteAccount removed the profile but auth deletion is still pending. */
export async function isAccountDeletionInProgress(uid: string): Promise<boolean> {
  try {
    const markerDoc = await getDoc(doc(db, 'accountDeletions', uid));
    return markerDoc.exists();
  } catch {
    // Fail closed: avoid recreating a profile while deletion state is unknown.
    return true;
  }
}
