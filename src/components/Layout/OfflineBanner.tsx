import React, { useEffect, useState } from 'react';
import { CloudUpload, WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePendingSyncCount } from '@/hooks/usePendingSyncCount';
import { retryPendingSync } from '@/utils/retryConnection';
import { themeColors } from '@/styles/colors';

const PENDING_SYNC_BANNER_DELAY_MS = 750;

export const OfflineBanner: React.FunctionComponent = () => {
  const isOnline = useNetworkStatus();
  const pendingSyncCount = usePendingSyncCount();
  const [isSyncing, setIsSyncing] = useState(false);
  const [visiblePendingCount, setVisiblePendingCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (pendingSyncCount === 0) {
      setVisiblePendingCount(0);
      setSyncMessage(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setVisiblePendingCount(pendingSyncCount);
    }, PENDING_SYNC_BANNER_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [pendingSyncCount]);

  if (isOnline && visiblePendingCount === 0) {
    return null;
  }

  const handleRetry = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const attempt = await retryPendingSync();
      setSyncMessage(attempt.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncMessageTone =
    syncMessage && (syncMessage.startsWith('All changes') || syncMessage.startsWith('Everything'))
      ? 'text-green-800 dark:text-green-300'
      : 'text-red-800 dark:text-red-300';

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full shrink-0 border-b border-amber-200/80 bg-amber-50 px-4 py-2.5 dark:border-amber-900/60 dark:bg-amber-950"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            {isOnline ? (
              <CloudUpload className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            ) : (
              <WifiOff className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            )}
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {isOnline
                ? `${visiblePendingCount} change${visiblePendingCount === 1 ? '' : 's'} waiting to sync.`
                : `You are offline. ${pendingSyncCount > 0 ? `${pendingSyncCount} change${pendingSyncCount === 1 ? '' : 's'} saved locally and ` : ''}cached data is available until you reconnect.`}
            </p>
          </div>
          {syncMessage && <p className={`mt-1 ml-6 text-xs ${syncMessageTone}`}>{syncMessage}</p>}
        </div>
        <button
          type="button"
          onClick={() => void handleRetry()}
          disabled={isSyncing}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${themeColors.border.default} ${themeColors.text.primary} hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-60`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Retry'}
        </button>
      </div>
    </div>
  );
};
