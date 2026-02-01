import React from 'react';
import { LoadingButton } from '@/components/Elements/Button/LoadingButton';
import { themeColors } from '@/styles/colors';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FunctionComponent<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'info',
  isLoading = false,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`${themeColors.background.card} relative rounded-lg w-full max-w-md p-6 shadow-xl border ${themeColors.border.default}`}
          >
            <h3 className={`text-lg font-semibold ${themeColors.text.primary} mb-2`}>{title}</h3>
            <p className={`${themeColors.text.secondary} mb-6`}>{message}</p>
            <div className="flex justify-end gap-3">
              {cancelText && (
                <button
                  onClick={onCancel}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${themeColors.background.app} ${themeColors.text.primary} border ${themeColors.border.default} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                >
                  {cancelText}
                </button>
              )}
              <LoadingButton
                onClick={onConfirm}
                isLoading={isLoading}
                variant={variant === 'info' ? 'primary' : variant}
                loadingText="Processing..."
                className="px-4 py-2"
              >
                {confirmText}
              </LoadingButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
