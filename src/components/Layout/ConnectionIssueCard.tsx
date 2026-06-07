import React, { useState } from 'react';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { retryConnection } from '@/utils/retryConnection';
import { themeColors } from '@/styles/colors';

interface ConnectionIssueCardProps {
  title: string;
  message: string;
  onRetry?: () => void | Promise<void>;
}

export const ConnectionIssueCard: React.FunctionComponent<ConnectionIssueCardProps> = ({
  title,
  message,
  onRetry,
}) => {
  const isOnline = useNetworkStatus();
  const [isChecking, setIsChecking] = useState(false);
  const Icon = isOnline ? AlertCircle : WifiOff;

  const handleRetry = async () => {
    setIsChecking(true);
    try {
      if (onRetry) {
        await onRetry();
      } else {
        await retryConnection();
      }
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="py-12 text-center">
      <Icon className={`mx-auto h-12 w-12 ${isOnline ? 'text-red-500' : 'text-amber-500'}`} />
      <h3 className={`mt-3 text-lg font-medium ${themeColors.text.primary}`}>{title}</h3>
      <p className={`mt-1 text-sm ${themeColors.text.secondary}`}>{message}</p>
      <button
        type="button"
        onClick={() => void handleRetry()}
        disabled={isChecking}
        className={`mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${themeColors.button.secondary} disabled:opacity-60`}
      >
        <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
        {isChecking ? 'Checking...' : 'Retry'}
      </button>
    </div>
  );
};
