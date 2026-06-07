import React from 'react';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { themeColors } from '@/styles/colors';

interface ConnectionIssueCardProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export const ConnectionIssueCard: React.FunctionComponent<ConnectionIssueCardProps> = ({
  title,
  message,
  onRetry,
}) => {
  const isOnline = useNetworkStatus();
  const Icon = isOnline ? AlertCircle : WifiOff;

  return (
    <div className="py-12 text-center">
      <Icon className={`mx-auto h-12 w-12 ${isOnline ? 'text-red-500' : 'text-amber-500'}`} />
      <h3 className={`mt-3 text-lg font-medium ${themeColors.text.primary}`}>{title}</h3>
      <p className={`mt-1 text-sm ${themeColors.text.secondary}`}>{message}</p>
      <button
        type="button"
        onClick={onRetry ?? (() => window.location.reload())}
        className={`mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${themeColors.button.secondary}`}
      >
        <RefreshCw className="h-4 w-4" />
        Retry
      </button>
    </div>
  );
};
