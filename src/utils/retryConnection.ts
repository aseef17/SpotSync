import { toast } from 'sonner';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { flushPendingMutations, type FlushResult } from '@/lib/localDb';

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

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message);
    if (message.trim()) {
      return message;
    }
  }
  return 'Unknown error';
}

function notifySyncResult(result: FlushResult): boolean {
  if (result.remainingCount === 0) {
    if (result.syncedCount > 0) {
      toast.success('All changes synced');
    }
    return true;
  }

  const detail =
    result.syncedCount > 0
      ? `${result.syncedCount} synced, ${result.remainingCount} still waiting.`
      : getErrorMessage(result.lastError);

  toast.error('Some changes could not sync', { description: detail });
  return false;
}

/** Flushes the offline mutation queue in the background without reloading the app. */
export async function retryPendingSync(): Promise<boolean> {
  if (!isBrowserOnline()) {
    const isReachable = await probeNetwork();
    if (!isReachable) {
      toast.message('Still offline', {
        description: 'Cached data is still available. Reconnect to sync the latest changes.',
      });
      return false;
    }
  }

  const result = await flushPendingMutations();
  return notifySyncResult(result);
}

interface RetryConnectionOptions {
  /** Reload the page after a successful connectivity probe. Default true for load-error screens. */
  reload?: boolean;
}

/** Checks connectivity and optionally reloads. Use retryPendingSync for the offline sync banner. */
export async function retryConnection(options: RetryConnectionOptions = {}): Promise<boolean> {
  const { reload = true } = options;
  const isReachable = await probeNetwork();

  if (!isReachable) {
    toast.message('Still offline', {
      description: 'Cached data is still available. Reconnect to sync the latest changes.',
    });
    return false;
  }

  const result = await flushPendingMutations();
  notifySyncResult(result);

  if (reload) {
    window.location.reload();
    return true;
  }

  return result.remainingCount === 0;
}
