import React from 'react';
import { X } from 'lucide-react';
import type { PlaceStatus } from '@/features/places/types/place';
import { passportStampImageUrl } from '@/features/passport/constants/stamps';
import { passportStampImageFilterClass } from '@/features/passport/utils/passportStampStyles';

interface PassportStampImageProps {
  stampId: string;
  status: PlaceStatus;
  className?: string;
  imageClassName?: string;
}

export const PassportStampImage: React.FunctionComponent<PassportStampImageProps> = ({
  stampId,
  status,
  className = '',
  imageClassName = '',
}) => {
  const isSkipped = status === 'not_going';

  return (
    <div className={`relative ${className}`}>
      <img
        src={passportStampImageUrl(stampId)}
        alt=""
        className={`w-full h-full object-contain drop-shadow-sm transition-all ${passportStampImageFilterClass(status)} ${imageClassName}`}
      />
      {isSkipped && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/15 rounded-full" />
          <X className="w-[70%] h-[70%] text-red-600 dark:text-red-400 stroke-[3]" aria-hidden />
        </div>
      )}
    </div>
  );
};
