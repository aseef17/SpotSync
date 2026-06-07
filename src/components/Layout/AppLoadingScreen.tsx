import React, { useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { retryConnection } from '@/utils/retryConnection';
import { themeColors } from '@/styles/colors';

interface AppLoadingScreenProps {
  title?: string;
  message?: string;
  showRetry?: boolean;
}

export const AppLoadingScreen: React.FunctionComponent<AppLoadingScreenProps> = ({
  title = 'Loading...',
  message = 'Please wait while we prepare your workspace.',
  showRetry = true,
}) => {
  const isOnline = useNetworkStatus();
  const [isChecking, setIsChecking] = useState(false);

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
      className={`min-h-screen ${themeColors.background.app} flex items-center justify-center px-4`}
    >
      <div className="w-full max-w-md text-center">
        {isOnline ? (
          <div
            className={`mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-2 border-blue-500 border-t-transparent`}
          />
        ) : (
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <WifiOff className="h-7 w-7 text-amber-700 dark:text-amber-300" />
          </div>
        )}

        <h1 className={`text-lg font-semibold ${themeColors.text.primary}`}>{title}</h1>
        <p className={`mt-2 text-sm ${themeColors.text.secondary}`}>
          {isOnline
            ? message
            : 'No internet connection detected. Reconnect to load the latest data, or retry once you are back online.'}
        </p>

        {!isOnline && showRetry && (
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={isChecking}
            className={`mt-6 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${themeColors.button.secondary} disabled:opacity-60`}
          >
            <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking...' : 'Retry'}
          </button>
        )}
      </div>
    </div>
  );
};
