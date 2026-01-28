import { useMemo } from 'react';
import { useToastContext } from '@/hooks/useToastContext';

export const useToast = () => {
  const { addToast, position, setPosition } = useToastContext();

  const toast = useMemo(() => ({
    success: (message: string, title?: string, duration?: number) => 
      addToast('success', message, title, duration),
    error: (message: string, title?: string, duration?: number) => 
      addToast('error', message, title, duration),
    info: (message: string, title?: string, duration?: number) => 
      addToast('info', message, title, duration),
    warning: (message: string, title?: string, duration?: number) => 
      addToast('warning', message, title, duration),
  }), [addToast]);

  return { toast, position, setPosition };
};
