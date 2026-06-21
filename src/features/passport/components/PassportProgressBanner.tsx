import React from 'react';
import type { PassportProgress } from '@/features/passport/utils/passportList';
import { PassportStampCollectionGrid } from '@/features/passport/components/PassportStampCollectionGrid';
import { themeColors } from '@/styles/colors';

interface PassportProgressBannerProps {
  progress: PassportProgress;
  onInfoClick: () => void;
}

export const PassportProgressBanner: React.FunctionComponent<PassportProgressBannerProps> = ({
  progress,
  onInfoClick,
}) => {
  const stampPct =
    progress.totalStampDesigns > 0
      ? Math.round((progress.uniqueStampsVisited / progress.totalStampDesigns) * 100)
      : 0;

  return (
    <div
      className={`mx-3 sm:mx-0 mb-3 rounded-xl border ${themeColors.border.default} bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 px-4 py-3`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${themeColors.text.primary}`}>
            Passport progress
          </p>
          <p className={`text-xs mt-0.5 ${themeColors.text.secondary}`}>
            {progress.uniqueStampsVisited} of {progress.totalStampDesigns} unique stamps collected
            · {progress.stampedPlacesVisited} of {progress.stampedPlacesTotal} stamp locations
            visited
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-white/70 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${stampPct}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onInfoClick}
          className="shrink-0 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
          aria-label="Passport information"
          title="Passport info"
        >
          i
        </button>
      </div>

      <PassportStampCollectionGrid
        visitedStampIds={progress.visitedStampIds}
        className="mt-3 pt-3 border-t border-white/60 dark:border-gray-700/60"
      />
    </div>
  );
};
