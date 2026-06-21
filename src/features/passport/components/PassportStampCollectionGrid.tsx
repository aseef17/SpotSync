import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { PlaceStatus } from '@/features/places/types/place';
import { PASSPORT_STAMPS, passportStampImageUrl } from '@/features/passport/constants/stamps';
import { PassportStampPreviewModal } from '@/features/passport/components/PassportStampPreviewModal';
import { passportStampImageFilterClass } from '@/features/passport/utils/passportStampStyles';

interface PassportStampCollectionGridProps {
  visitedStampIds: readonly string[];
  className?: string;
}

export const PassportStampCollectionGrid: React.FunctionComponent<
  PassportStampCollectionGridProps
> = ({ visitedStampIds, className = '' }) => {
  const visited = React.useMemo(() => new Set(visitedStampIds), [visitedStampIds]);
  const [previewStampId, setPreviewStampId] = useState<string | null>(null);

  const previewStatus: PlaceStatus | null = previewStampId
    ? visited.has(previewStampId)
      ? 'visited'
      : 'not_visited'
    : null;

  return (
    <div className={className}>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {PASSPORT_STAMPS.map((stamp) => {
          const collected = visited.has(stamp.id);

          return (
            <button
              key={stamp.id}
              type="button"
              className={`relative aspect-square rounded-lg p-0.5 transition-all cursor-pointer hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent ${
                collected
                  ? 'bg-white/80 dark:bg-gray-900/60 ring-1 ring-green-500/40 shadow-sm'
                  : 'bg-white/30 dark:bg-gray-900/20 opacity-80'
              }`}
              title={`${stamp.name}${collected ? ' — collected' : ' — not collected yet'}`}
              aria-label={`${stamp.name}${collected ? ', collected' : ', not collected'}. View stamp`}
              onClick={() => setPreviewStampId(stamp.id)}
            >
              <img
                src={passportStampImageUrl(stamp.id)}
                alt=""
                className={`w-full h-full object-contain ${passportStampImageFilterClass(
                  collected ? 'visited' : 'not_visited'
                )}`}
              />
              {collected && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white shadow-sm pointer-events-none">
                  <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Collected
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
          Not yet
        </span>
      </p>

      {previewStampId && previewStatus && (
        <PassportStampPreviewModal
          isOpen
          onClose={() => setPreviewStampId(null)}
          stampId={previewStampId}
          status={previewStatus}
        />
      )}
    </div>
  );
};
