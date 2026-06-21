import React, { useState } from 'react';
import type { PlaceStatus } from '@/features/places/types/place';
import { PASSPORT_STAMP_BY_ID } from '@/features/passport/constants/stamps';
import { PassportStampImage } from '@/features/passport/components/PassportStampImage';
import { PassportStampPreviewModal } from '@/features/passport/components/PassportStampPreviewModal';

interface PassportStampBadgeProps {
  stampId: string;
  status: PlaceStatus;
  size?: 'sm' | 'md';
  className?: string;
  /** Opens a stamp preview popup on click. */
  interactive?: boolean;
  placeName?: string;
}

const SIZE_CLASSES = {
  sm: 'w-9 h-9',
  md: 'w-11 h-11',
} as const;

export const PassportStampBadge: React.FunctionComponent<PassportStampBadgeProps> = ({
  stampId,
  status,
  size = 'md',
  className = '',
  interactive = false,
  placeName,
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const stamp = PASSPORT_STAMP_BY_ID[stampId];
  if (!stamp) return null;

  const content = (
    <PassportStampImage stampId={stampId} status={status} className="w-full h-full" />
  );

  if (!interactive) {
    return (
      <div
        className={`relative ${SIZE_CLASSES[size]} shrink-0 ${className}`}
        title={stamp.name}
        aria-label={`${stamp.name} stamp`}
      >
        {content}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`relative ${SIZE_CLASSES[size]} shrink-0 cursor-pointer rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ${className}`}
        title={`View ${stamp.name} stamp`}
        aria-label={`View ${stamp.name} stamp`}
        onClick={(e) => {
          e.stopPropagation();
          setPreviewOpen(true);
        }}
      >
        {content}
      </button>
      <PassportStampPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        stampId={stampId}
        status={status}
        placeName={placeName}
      />
    </>
  );
};
