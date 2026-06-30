import React from 'react';
import type { PlaceStatus } from '@/features/places/types/place';
import { PASSPORT_STAMP_BY_ID } from '@/features/passport/constants/stamps';
import { PassportStampBadge } from '@/features/passport/components/PassportStampBadge';
import { getPassportStampIds } from '@/features/passport/utils/passportStampIds';

interface PassportStampBadgesProps {
  place: {
    passportStampId?: string;
    passportStampIds?: string[];
    name: string;
    status: PlaceStatus;
  };
  size?: 'sm' | 'md';
  className?: string;
  interactive?: boolean;
  maxVisible?: number;
}

export const PassportStampBadges: React.FunctionComponent<PassportStampBadgesProps> = ({
  place,
  size = 'md',
  className = '',
  interactive = false,
  maxVisible = 3,
}) => {
  const stampIds = getPassportStampIds(place);
  if (!stampIds.length) return null;

  const visible = stampIds.slice(0, maxVisible);
  const overflow = stampIds.length - visible.length;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {visible.map((stampId) => (
        <PassportStampBadge
          key={stampId}
          stampId={stampId}
          status={place.status}
          size={size}
          interactive={interactive}
          placeName={place.name}
        />
      ))}
      {overflow > 0 && (
        <span
          className="text-[10px] font-semibold text-violet-600 dark:text-violet-300 px-1"
          title={stampIds
            .slice(maxVisible)
            .map((id) => PASSPORT_STAMP_BY_ID[id]?.name ?? id)
            .join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
};
