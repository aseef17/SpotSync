import React, { useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { ToastType, ToastPosition } from '@/types/toast';
import { ToastContext } from '@/providers/toast-context';

export const ToastProvider: React.FunctionComponent<{ children: ReactNode }> = ({ children }) => {
  // We keep these for interface compatibility but they are no-ops with sonner
  // as sonner handles positioning and state internally
  const [position, setPosition] = React.useState<ToastPosition>('top-right');

  const removeToast = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, title?: string, duration = 5000) => {
      // Adapter to map our types to sonner
      const options = {
        duration,
        description: message,
      };

      const mainText = title || message;
      const subText = title ? message : undefined;
      const sonnerOptions = { ...options, description: subText };

      switch (type) {
        case 'success':
          toast.success(mainText, sonnerOptions);
          break;
        case 'error':
          toast.error(mainText, sonnerOptions);
          break;
        case 'warning':
          toast.warning(mainText, sonnerOptions);
          break;
        case 'info':
          toast.info(mainText, sonnerOptions);
          break;
        default:
          toast(mainText, sonnerOptions);
      }
    },
    []
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast, position, setPosition }}>
      {children}
    </ToastContext.Provider>
  );
};
