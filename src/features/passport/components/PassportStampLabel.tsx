import React from 'react';
import { PASSPORT_STAMP_BY_ID } from '@/features/passport/constants/stamps';

interface PassportStampLabelProps {
  stampId: string;
  className?: string;
}

/** Artist stamp name — visually distinct from venue category/metadata. */
export const PassportStampLabel: React.FunctionComponent<PassportStampLabelProps> = ({
  stampId,
  className = '',
}) => {
  const stamp = PASSPORT_STAMP_BY_ID[stampId];
  if (!stamp) return null;

  return (
    <p
      className={`font-serif italic font-semibold text-xs leading-snug text-violet-700 dark:text-violet-300 tracking-wide ${className}`}
      title={`Stamp: ${stamp.name}`}
    >
      {stamp.name}
    </p>
  );
};
