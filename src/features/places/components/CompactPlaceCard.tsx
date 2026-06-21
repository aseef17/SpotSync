import React from 'react';
import { motion } from 'framer-motion';
import { MapIcon, Star, Edit3 } from 'lucide-react';
import { CachedPlacePhoto } from '@/features/places/components/CachedPlacePhoto';
import { PlaceStatusSelector } from '@/features/places/components/PlaceStatusSelector';
import {
  getTodayHoursText,
  isPlaceOpen,
  getPlaceThumbnail,
} from '@/features/places/utils/placeHelpers';
import type { Place } from '@/features/places/types/place';
import type { PlaceList } from '@/features/lists/types/list';
import { themeColors } from '@/styles/colors';
import { PassportStampBadge } from '@/features/passport/components/PassportStampBadge';
import { PassportStampLabel } from '@/features/passport/components/PassportStampLabel';
import { isPassportList } from '@/features/passport/utils/passportList';

interface CompactPlaceCardProps {
  place: Place;
  list: PlaceList;
  onClick: (place: Place) => void;
  onStatusChange: (placeId: string) => void;
  layout?: boolean;
}

export const CompactPlaceCard = React.memo<CompactPlaceCardProps>(
  ({ place, list, onClick, onStatusChange, layout = false }) => {
    const showPassportStamp = isPassportList(list) && place.passportStampId;

    const formatPriceLevel = (level?: number) => {
      if (!level) return '';
      return '$'.repeat(Math.min(level, 4));
    };

    return (
      <motion.div
        layout={layout}
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        className={`relative ${themeColors.background.card} rounded-lg shadow-sm border ${themeColors.border.default} hover:shadow-md transition-shadow cursor-pointer flex items-center p-3 gap-4`}
        onClick={() => onClick(place)}
      >
        {showPassportStamp && place.passportStampId && (
          <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
            <PassportStampBadge
              stampId={place.passportStampId}
              status={place.status}
              size="sm"
              interactive
              placeName={place.name}
            />
          </div>
        )}
        <div className="w-20 h-20 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden">
          {getPlaceThumbnail(place) ? (
            <CachedPlacePhoto
              placeId={place.id}
              photoRef={getPlaceThumbnail(place)}
              photoIndex={0}
              alt={place.name}
              maxWidth={200}
              maxHeight={200}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <MapIcon className={`h-5 w-5 ${themeColors.text.secondary}`} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className={`text-base font-medium ${themeColors.text.primary} truncate`}>
                {place.name}
              </h3>
              {showPassportStamp && place.passportStampId && (
                <PassportStampLabel stampId={place.passportStampId} className="mt-0.5" />
              )}
            </div>
            <div onClick={(e) => e.stopPropagation()} className="shrink-0 scale-90 origin-right">
              <PlaceStatusSelector
                place={place}
                customStatuses={list.customStatuses}
                onStatusChanged={() => onStatusChange(place.id)}
                compact
              />
            </div>
          </div>

          <p className={`text-sm ${themeColors.text.secondary} truncate`}>{place.address}</p>

          {(place.openNow !== undefined || getTodayHoursText(place)) && (
            <div
              className={`flex items-center gap-1.5 text-xs mt-0.5 ${themeColors.text.secondary}`}
            >
              {place.openNow !== undefined && (
                <span
                  className={
                    isPlaceOpen(place)
                      ? 'text-green-600 dark:text-green-400 font-medium'
                      : 'text-red-600 dark:text-red-400 font-medium'
                  }
                >
                  {isPlaceOpen(place) ? 'Open' : 'Closed'}
                </span>
              )}
              {place.openNow !== undefined && getTodayHoursText(place) && (
                <span className="text-gray-400">·</span>
              )}
              {getTodayHoursText(place) && (
                <span className="truncate">{getTodayHoursText(place)}</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-gray-500 truncate mt-0.5">
            {place.category && (
              <span className="font-medium text-gray-700 dark:text-gray-300">{place.category}</span>
            )}
            {place.rating && (
              <div className="flex items-center">
                <Star className="h-3 w-3 text-yellow-400 mr-0.5" />
                <span>{place.rating}</span>
              </div>
            )}
            {place.priceLevel && <span>{formatPriceLevel(place.priceLevel)}</span>}
            {place.notes && (
              <div className="flex items-center gap-1 text-blue-500 ml-auto mr-0">
                <Edit3 className="w-3 h-3" />
                <span>Has notes</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
);

CompactPlaceCard.displayName = 'CompactPlaceCard';
