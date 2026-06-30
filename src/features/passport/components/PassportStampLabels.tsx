import React from 'react';
import { PASSPORT_STAMP_BY_ID } from '@/features/passport/constants/stamps';
import { getPassportStampIds } from '@/features/passport/utils/passportStampIds';

interface PassportStampLabelsProps {
  place: { passportStampId?: string; passportStampIds?: string[] };
  className?: string;
}

/** Artist stamp names — supports multiple stamps per place. */
export const PassportStampLabels: React.FunctionComponent<PassportStampLabelsProps> = ({
  place,
  className = '',
}) => {
  const names = getPassportStampIds(place)
    .map((id) => PASSPORT_STAMP_BY_ID[id]?.name)
    .filter((name): name is string => Boolean(name));

  if (!names.length) return null;

  return (
    <p
      className={`font-serif italic font-semibold text-xs leading-snug text-violet-700 dark:text-violet-300 tracking-wide ${className}`}
      title={`Stamps: ${names.join(', ')}`}
    >
      {names.join(' · ')}
    </p>
  );
};
