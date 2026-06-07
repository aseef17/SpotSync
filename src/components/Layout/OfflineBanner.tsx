import React, { useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { retryConnection } from '@/utils/retryConnection';
import { themeColors } from '@/styles/colors';

export const OfflineBanner: React.FunctionComponent = () => {
  const isOnline = useNetworkStatus();
  const [isChecking, setIsChecking] = useState(false);

  if (isOnline) return null;

  const handleRetry = async () => {
    setIsChecking(true);
    try {
      await retryConnection();
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full shrink-0 border-b border-amber-200/80 bg-amber-50 px-4 py-2.5 dark:border-amber-900/60 dark:bg-amber-950"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            You are offline. Cached data may still be available, but new changes will not be synced
            until you reconnect.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRetry()}
          disabled={isChecking}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${themeColors.border.default} ${themeColors.text.primary} hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-60`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Checking...' : 'Retry'}
        </button>
      </div>
    </div>
  );
};
