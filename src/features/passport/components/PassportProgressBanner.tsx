import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PassportProgress } from '@/features/passport/utils/passportList';
import { PassportStampCollectionGrid } from '@/features/passport/components/PassportStampCollectionGrid';
import { themeColors } from '@/styles/colors';

interface PassportProgressBannerProps {
  progress: PassportProgress;
  onInfoClick: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const PassportProgressBanner: React.FunctionComponent<PassportProgressBannerProps> = ({
  progress,
  onInfoClick,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const stampPct =
    progress.totalStampDesigns > 0
      ? Math.round((progress.uniqueStampsVisited / progress.totalStampDesigns) * 100)
      : 0;

  const collapsible = !!onToggleCollapse;

  return (
    <div
      className={`mx-3 sm:mx-0 mb-3 rounded-xl border ${themeColors.border.default} bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 px-4 py-3`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className={`min-w-0 flex-1 text-left ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={collapsible ? onToggleCollapse : undefined}
          aria-expanded={collapsible ? !isCollapsed : undefined}
        >
          <p className={`text-sm font-semibold ${themeColors.text.primary}`}>Passport progress</p>
          <p className={`text-xs mt-0.5 ${themeColors.text.secondary}`}>
            {progress.uniqueStampsVisited} of {progress.totalStampDesigns} unique stamps collected ·{' '}
            {progress.stampedPlacesVisited} of {progress.stampedPlacesTotal} stamp locations visited
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-white/70 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${stampPct}%` }}
            />
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {collapsible && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
              aria-label={isCollapsed ? 'Expand passport stamps' : 'Collapse passport stamps'}
            >
              {isCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onInfoClick}
            className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
            aria-label="Passport information"
            title="Passport info"
          >
            i
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {(!collapsible || !isCollapsed) && (
          <motion.div
            initial={collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <PassportStampCollectionGrid
              visitedStampIds={progress.visitedStampIds}
              className="mt-3 pt-3 border-t border-white/60 dark:border-gray-700/60"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
