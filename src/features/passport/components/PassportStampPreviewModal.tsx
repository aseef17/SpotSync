import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { PlaceStatus } from '@/features/places/types/place';
import { PASSPORT_STAMP_BY_ID } from '@/features/passport/constants/stamps';
import { PassportStampImage } from '@/features/passport/components/PassportStampImage';
import { themeColors } from '@/styles/colors';

interface PassportStampPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  stampId: string;
  status: PlaceStatus;
  placeName?: string;
}

function statusLabel(status: PlaceStatus): string | null {
  if (status === 'visited') return 'Visited';
  if (status === 'not_going') return 'Not going';
  if (status === 'not_visited') return 'Not visited yet';
  return null;
}

function statusBadgeClass(status: PlaceStatus): string {
  if (status === 'visited') {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  }
  if (status === 'not_going') {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

export const PassportStampPreviewModal: React.FunctionComponent<PassportStampPreviewModalProps> = ({
  isOpen,
  onClose,
  stampId,
  status,
  placeName,
}) => {
  const stamp = PASSPORT_STAMP_BY_ID[stampId];

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !stamp) return null;

  const label = statusLabel(status);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passport-stamp-preview-title"
    >
      <button
        type="button"
        className={`absolute inset-0 ${themeColors.background.modalOverlay}`}
        onClick={onClose}
        aria-label="Close stamp preview"
      />
      <div
        className={`relative w-full max-w-sm rounded-2xl ${themeColors.background.card} shadow-2xl border ${themeColors.border.default} p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center gap-4 pt-1">
          <PassportStampImage
            stampId={stampId}
            status={status}
            className="w-48 h-48 sm:w-56 sm:h-56"
          />

          <div className="space-y-1.5 px-2">
            <h2
              id="passport-stamp-preview-title"
              className={`font-serif italic font-semibold text-base text-violet-700 dark:text-violet-300`}
            >
              {stamp.name}
            </h2>
            {placeName && <p className={`text-sm ${themeColors.text.secondary}`}>{placeName}</p>}
            {label && (
              <span
                className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(status)}`}
              >
                {label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
