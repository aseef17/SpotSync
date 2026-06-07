import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { themeColors } from '@/styles/colors';

export const OfflineBanner: React.FunctionComponent = () => {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={`fixed top-0 left-0 right-0 z-[200] border-b border-amber-200/80 bg-amber-50/95 px-4 py-2.5 backdrop-blur-sm dark:border-amber-900/60 dark:bg-amber-950/95`}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <WifiOff className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              You&apos;re offline. Cached data may still be available, but new changes won&apos;t
              sync until you reconnect.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${themeColors.border.default} ${themeColors.text.primary} hover:bg-amber-100 dark:hover:bg-amber-900/40`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
      <div aria-hidden className="h-11" />
    </>
  );
};
