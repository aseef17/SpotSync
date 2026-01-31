import { useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import { logger } from '@/utils/logger';

interface DeferredActionOptions {
  timeout?: number;
  toastMessage: string;
  undoLabel?: string;
  undoMessage?: string;
  onUndo: () => void;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export const useDeferredAction = () => {
  const { toast } = useToast();
  /*
   * Active timers are intentionally NOT cleared on unmount.
   * We want the deferred action (like delete) to complete even if the user navigates away.
   */
  const trigger = useCallback(
    (actionFn: () => Promise<void>, options: DeferredActionOptions) => {
      const timeoutMs = options.timeout || 4000;

      const timerId = setTimeout(async () => {
        try {
          await actionFn();
          options.onSuccess?.();
        } catch (error) {
          logger.error('Deferred action failed:', error);
          // On failure, we must revert the UI locally since the action didn't happen
          options.onUndo();
          options.onError?.(error);
          toast.error('Action failed, changes reverted');
        }
      }, timeoutMs);

      toast.success(options.toastMessage, undefined, timeoutMs, {
        label: options.undoLabel || 'Undo',
        onClick: async () => {
          clearTimeout(timerId);
          options.onUndo();
          toast.success(options.undoMessage || 'Canceled');
        },
      });
    },
    [toast]
  );

  return { trigger };
};
