import React from 'react';
import { motion } from 'framer-motion';
import { MapIcon, Star, Edit3 } from 'lucide-react';
import { CachedPlacePhoto } from '@/features/places/components/CachedPlacePhoto';
import { PlaceStatusSelector } from '@/features/places/components/PlaceStatusSelector';
import {
  formatPrice,
  getPlaceThumbnail,
  getTodayHoursText,
  isPlaceOpen,
} from '@/features/places/utils/placeHelpers';
import type { Place } from '@/features/places/types/place';
import type { PlaceList } from '@/features/lists/types/list';
import { themeColors } from '@/styles/colors';
import { PassportStampBadge } from '@/features/passport/components/PassportStampBadge';
import { PassportStampLabel } from '@/features/passport/components/PassportStampLabel';
import { isPassportList } from '@/features/passport/utils/passportList';

interface PlaceCardProps {
  place: Place;
  list: PlaceList;
  onClick: (place: Place) => void;
  onStatusChange: (placeId: string) => void;
  layout?: boolean;
  density?: 'comfortable' | 'compact';
}

export const PlaceCard = React.memo<PlaceCardProps>(
  ({ place, list, onClick, onStatusChange, layout = false, density = 'compact' }) => {
    const showPassportStamp = isPassportList(list) && place.passportStampId;

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
        className={`relative ${themeColors.background.card} border-b ${themeColors.border.default} hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer flex p-4 gap-4 w-full`}
        onClick={() => onClick(place)}
      >
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="mb-1">
            <h3
              className={`text-[15px] font-semibold ${themeColors.text.primary} line-clamp-1`}
            >
              {place.name}
            </h3>
            {showPassportStamp && place.passportStampId && (
              <PassportStampLabel stampId={place.passportStampId} className="mt-0.5 mb-1" />
            )}
            <div
              className={`flex items-center gap-1.5 text-[13px] ${themeColors.text.secondary} mb-1`}
            >
              {place.rating && (
                <div className="flex items-center text-gray-700 dark:text-gray-300">
                  <span className="font-medium mr-1">{place.rating}</span>
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                </div>
              )}
              {place.rating && <span className="text-gray-400 text-[10px]">•</span>}
              {place.passportCategory ? (
                <span className="truncate">{place.passportCategory}</span>
              ) : (
                place.category && <span className="truncate">{place.category}</span>
              )}
              {place.priceLevel !== undefined && place.priceLevel > 0 && (
                <>
                  <span className="text-gray-400 text-[10px]">•</span>
                  <span>{formatPrice(place.priceLevel)}</span>
                </>
              )}
            </div>
            <p className={`text-[13px] ${themeColors.text.secondary} line-clamp-1`}>
              {place.address}
            </p>
            {(place.openNow !== undefined || getTodayHoursText(place)) && (
              <div
                className={`flex items-center gap-1.5 text-[12px] mt-0.5 ${themeColors.text.secondary}`}
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
          </div>

          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {place.cuisines?.slice(0, 2).map((cuisine) => (
              <span
                key={cuisine}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 dark:bg-gray-800 ${themeColors.text.secondary} capitalize`}
              >
                {cuisine}
              </span>
            ))}
          </div>

          {place.notes && (
            <div className="mt-2.5 flex items-start gap-1.5">
              <Edit3 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${themeColors.text.secondary}`} />
              <p
                className={`text-[13px] ${themeColors.text.secondary} italic ${
                  density === 'comfortable' ? 'line-clamp-3' : 'line-clamp-1'
                }`}
              >
                "{place.notes}"
              </p>
            </div>
          )}
        </div>

        <div className="w-[100px] h-[100px] shrink-0 relative flex-col flex items-end">
          <div className="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800/50">
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
                <MapIcon className={`h-8 w-8 ${themeColors.text.secondary} opacity-50`} />
              </div>
            )}
          </div>
          <div className="absolute -top-2 -right-2 z-10 flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
            {showPassportStamp && place.passportStampId && (
              <PassportStampBadge
                stampId={place.passportStampId}
                status={place.status}
                size="sm"
                interactive
                placeName={place.name}
                className="ring-2 ring-white dark:ring-gray-900 rounded-full bg-white/90 dark:bg-gray-900/90"
              />
            )}
            <PlaceStatusSelector
              place={place}
              customStatuses={list.customStatuses}
              onStatusChanged={() => onStatusChange(place.id)}
              compact
            />
          </div>
        </div>
      </motion.div>
    );
  }
);

PlaceCard.displayName = 'PlaceCard';
