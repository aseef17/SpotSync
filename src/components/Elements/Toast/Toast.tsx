import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import type { ToastMessage } from '@/types/toast';
import { themeColors } from '@/styles/colors';

interface ToastProps {
  toast: ToastMessage;
  removeToast: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const typeStyles = {
  success:
    'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800',
  error:
    'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
  info: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  warning:
    'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800',
};

export const Toast: React.FC<ToastProps> = ({ toast, removeToast }) => {
  const Icon = icons[toast.type];

  // Pause timer on hover could be added later

  return (
    <div
      className={`relative flex w-full max-w-sm overflow-hidden rounded-lg border shadow-lg transition-all duration-300 pointer-events-auto ${typeStyles[toast.type]} ${themeColors.background.card}`}
      role="alert"
    >
      <div className="flex p-4 w-full">
        <div className="flex-shrink-0">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="ml-3 flex-1">
          {toast.title && <p className="text-sm font-medium mb-1">{toast.title}</p>}
          <p className="text-sm opacity-90">{toast.message}</p>
        </div>
        <div className="ml-4 flex flex-shrink-0">
          <button
            type="button"
            className="inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 opacity-60 hover:opacity-100"
            onClick={() => removeToast(toast.id)}
          >
            <span className="sr-only">Close</span>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
