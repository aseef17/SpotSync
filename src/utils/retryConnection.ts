import { toast } from 'sonner';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { flushPendingMutations } from '@/lib/localDb';

const CONNECTIVITY_PROBE_TIMEOUT_MS = 4000;

async function probeNetwork(): Promise<boolean> {
  if (!isBrowserOnline()) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CONNECTIVITY_PROBE_TIMEOUT_MS);

    await fetch(`${window.location.origin}/`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });

    window.clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

/** Checks connectivity before reloading. Keeps cached UI visible when still offline. */
export async function retryConnection(): Promise<boolean> {
  const isReachable = await probeNetwork();

  if (isReachable) {
    await flushPendingMutations();
    window.location.reload();
    return true;
  }

  toast.message('Still offline', {
    description: 'Cached data is still available. Reconnect to sync the latest changes.',
  });
  return false;
}
