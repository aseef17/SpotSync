import { getDoc, type DocumentReference, type DocumentSnapshot } from 'firebase/firestore';
import { syncDebug, syncDebugError } from '@/utils/syncDebug';

export function isFirestorePermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String(error.code) : '';
  return code === 'permission-denied';
}

function missingMembershipSnap(ref: DocumentReference): DocumentSnapshot {
  return {
    exists: () => false,
    data: () => undefined,
    id: ref.id,
    ref,
  } as DocumentSnapshot;
}

/**
 * Reads a listPlaces doc, treating permission-denied on missing docs as non-existent.
 * Firestore get rules reference resource.data.listId, so absent docs deny instead of
 * returning exists:false.
 */
export async function safeGetMembershipDoc(
  ref: DocumentReference,
  phase: string,
  context: Record<string, unknown> = {}
): Promise<DocumentSnapshot> {
  syncDebug('safeMembershipGetDoc-start', { phase, membershipId: ref.id, ...context });
  try {
    const snap = await getDoc(ref);
    syncDebug('safeMembershipGetDoc-ok', {
      phase,
      membershipId: ref.id,
      exists: snap.exists(),
      ...context,
    });
    return snap;
  } catch (error) {
    if (isFirestorePermissionDenied(error)) {
      syncDebug('safeMembershipGetDoc-denied-as-missing', {
        phase,
        membershipId: ref.id,
        ...context,
      });
      return missingMembershipSnap(ref);
    }

    syncDebugError('safeMembershipGetDoc-failed', error, {
      phase,
      membershipId: ref.id,
      ...context,
    });
    throw error;
  }
}
