import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { enqueueMutation } from '@/lib/localDb/mutationQueue';
import { flushPendingMutations } from '@/lib/localDb/syncEngine';
import type { MutationPayload, MutationType } from '@/lib/localDb/types';

export async function queueOfflineMutation(
  type: MutationType,
  entityId: string,
  payload: MutationPayload,
  applyLocal?: () => Promise<void>
): Promise<void> {
  if (applyLocal) {
    await applyLocal();
  }

  await enqueueMutation({ type, entityId, payload });

  if (isBrowserOnline()) {
    await flushPendingMutations();
  }
}
