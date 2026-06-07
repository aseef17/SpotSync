import React, { useState } from 'react';
import { LoadingButton } from '@/components/Elements/Button/LoadingButton';
import { themeColors } from '@/styles/colors';
import { motion, AnimatePresence } from 'framer-motion';
import { useScrollLock } from '@/hooks/useScrollLock';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
  requiredPhrase?: string;
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
  requiredPhrase,
}) => {
  const [phraseInput, setPhraseInput] = useState('');
  useScrollLock(isOpen);

  const phraseMatches = !requiredPhrase || phraseInput === requiredPhrase;

  const handleCancel = () => {
    if (isLoading) return;
    setPhraseInput('');
    onCancel();
  };

  const handleConfirm = async () => {
    try {
      await onConfirm();
      setPhraseInput('');
    } catch {
      // Parent handlers are expected to surface errors; keep phrase so user can retry.
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className={`absolute inset-0 ${themeColors.background.modalOverlay}`}
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
            {requiredPhrase && (
              <div className="mb-6">
                <label className={`block text-sm font-medium ${themeColors.text.secondary} mb-1`}>
                  To confirm, type &quot;{requiredPhrase}&quot; below
                </label>
                <input
                  type="text"
                  value={phraseInput}
                  onChange={(e) => setPhraseInput(e.target.value)}
                  className={`w-full px-3 py-2 border ${themeColors.border.default} ${themeColors.background.app} rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500`}
                  placeholder={requiredPhrase}
                />
              </div>
            )}
            <div className="flex justify-end gap-3">
              {cancelText && (
                <button
                  onClick={handleCancel}
                  disabled={isLoading}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${themeColors.background.app} ${themeColors.text.primary} border ${themeColors.border.default} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {cancelText}
                </button>
              )}
              <LoadingButton
                onClick={handleConfirm}
                isLoading={isLoading}
                disabled={!phraseMatches}
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
