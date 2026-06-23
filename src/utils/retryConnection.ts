import { toast } from 'sonner';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { auth } from '@/lib/firebase';
import { flushPendingMutations, type FlushResult } from '@/lib/localDb';
import { initLocalDataStore } from '@/lib/localDb/localDataStore';
import { formatSyncFailureDetail } from '@/lib/localDb/syncMutationRecovery';
import { isSyncDebugEnabled, syncDebug } from '@/utils/syncDebug';

const CONNECTIVITY_PROBE_TIMEOUT_MS = 4000;

export interface SyncAttemptResult {
  ok: boolean;
  offline?: boolean;
  result?: FlushResult;
  message: string;
}

interface ProbeNetworkOptions {
  /** Attempt fetch even when navigator.onLine is false (manual retry while browser still reports offline). */
  ignoreBrowserOffline?: boolean;
}

async function probeNetwork(options: ProbeNetworkOptions = {}): Promise<boolean> {
  if (!options.ignoreBrowserOffline && !isBrowserOnline()) {
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

function notifySyncResult(
  result: FlushResult,
  options: { manual?: boolean } = {}
): SyncAttemptResult {
  if (result.lastError && result.remainingCount === 0 && result.syncedCount === 0) {
    const detail = getErrorMessage(result.lastError);
    toast.error('Sync failed', { description: detail });
    return { ok: false, result, message: detail };
  }

  if (result.remainingCount === 0) {
    if (result.syncedCount > 0) {
      toast.success('All changes synced');
      return { ok: true, result, message: 'All changes synced.' };
    }

    const message = 'Everything is up to date.';
    if (options.manual) {
      toast.success(message);
    }
    return { ok: true, result, message };
  }

  const detail = formatSyncFailureDetail(result, getErrorMessage);
  toast.error('Some changes could not sync', { description: detail });
  return { ok: false, result, message: detail };
}

/** Flushes the offline mutation queue in the background without reloading the app. */
export async function retryPendingSync(): Promise<SyncAttemptResult> {
  syncDebug('retry-start', {
    online: isBrowserOnline(),
    debugEnabled: isSyncDebugEnabled(),
  });

  try {
    await initLocalDataStore();
    syncDebug('local-store-ready');
  } catch (error) {
    const message = `Local database is not ready: ${getErrorMessage(error)}`;
    syncDebug('local-store-failed', { error: getErrorMessage(error) });
    toast.error('Could not start sync', { description: message });
    return { ok: false, message };
  }

  const browserSaysOnline = isBrowserOnline();

  if (!browserSaysOnline) {
    syncDebug('probing-network');
    const isReachable = await probeNetwork({ ignoreBrowserOffline: true });
    if (!isReachable) {
      const message = 'Still offline. Cached data is available until you reconnect.';
      syncDebug('probe-failed');
      toast.message('Still offline', {
        description: 'Cached data is still available. Reconnect to sync the latest changes.',
      });
      return { ok: false, offline: true, message };
    }
    syncDebug('probe-succeeded');
  }

  try {
    syncDebug('flush-start', { force: true, uid: auth.currentUser?.uid ?? null });
    const result = await flushPendingMutations({
      ignoreBrowserOffline: !browserSaysOnline,
      force: true,
    });
    syncDebug('flush-complete', {
      synced: result.syncedCount,
      remaining: result.remainingCount,
      hasError: Boolean(result.lastError),
    });
    return notifySyncResult(result, { manual: true });
  } catch (error) {
    const message = `Sync failed unexpectedly: ${getErrorMessage(error)}`;
    syncDebug('flush-threw', { error: getErrorMessage(error) });
    toast.error('Sync failed', { description: message });
    return { ok: false, message };
  }
}

interface RetryConnectionOptions {
  /** Reload the page after a successful connectivity probe. Default true for load-error screens. */
  reload?: boolean;
}

/** Checks connectivity and optionally reloads. Use retryPendingSync for the offline sync banner. */
export async function retryConnection(options: RetryConnectionOptions = {}): Promise<boolean> {
  const { reload = true } = options;
  const browserSaysOnline = isBrowserOnline();

  if (!browserSaysOnline) {
    const isReachable = await probeNetwork({ ignoreBrowserOffline: true });
    if (!isReachable) {
      toast.message('Still offline', {
        description: 'Cached data is still available. Reconnect to sync the latest changes.',
      });
      return false;
    }
  }

  const result = await flushPendingMutations({
    ignoreBrowserOffline: !browserSaysOnline,
    force: true,
  });
  notifySyncResult(result);

  if (reload) {
    window.location.reload();
    return true;
  }

  return result.remainingCount === 0;
}
