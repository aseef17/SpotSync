import { useMemo } from 'react';
import { useToastContext } from '@/hooks/useToastContext';

export const useToast = () => {
  const { addToast, position, setPosition } = useToastContext();

  const toast = useMemo(
    () => ({
      success: (
        message: string,
        title?: string,
        duration?: number,
        action?: { label: string; onClick: () => void | Promise<void> }
      ) => addToast('success', message, title, duration, action),
      error: (
        message: string,
        title?: string,
        duration?: number,
        action?: { label: string; onClick: () => void | Promise<void> }
      ) => addToast('error', message, title, duration, action),
      info: (
        message: string,
        title?: string,
        duration?: number,
        action?: { label: string; onClick: () => void | Promise<void> }
      ) => addToast('info', message, title, duration, action),
      warning: (
        message: string,
        title?: string,
        duration?: number,
        action?: { label: string; onClick: () => void | Promise<void> }
      ) => addToast('warning', message, title, duration, action),
    }),
    [addToast]
  );

  return { toast, position, setPosition };
};
