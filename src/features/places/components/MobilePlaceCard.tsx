import React from 'react';
import { Star } from 'lucide-react';
import { CachedPlacePhoto } from '@/features/places/components/CachedPlacePhoto';
import { themeColors } from '@/styles/colors';
import { formatCategoryName } from '@/constants/placeCategories';
import {
  formatPrice,
  getPlaceAttribution,
  getTodayHoursText,
  formatPlaceDistance,
  isPlaceOpen,
} from '@/features/places/utils/placeHelpers';
import type { Place } from '@/features/places/types/place';
import type { PlaceList } from '@/features/lists/types/list';
import { PassportStampBadges } from '@/features/passport/components/PassportStampBadges';
import { PassportStampLabels } from '@/features/passport/components/PassportStampLabels';
import { isPassportList } from '@/features/passport/utils/passportList';
import { placeHasAnyPassportStamp } from '@/features/passport/utils/passportStampIds';

interface MobilePlaceCardProps {
  place: Place;
  list: PlaceList;
  userLocation: { lat: number; lng: number } | null;
  onClick: (place: Place) => void;
}

export const MobilePlaceCard = React.memo<MobilePlaceCardProps>(
  ({ place, list, userLocation, onClick }) => {
    const showPassportStamp = isPassportList(list) && placeHasAnyPassportStamp(place);
    const hoursText = getTodayHoursText(place);
    const categoryText = place.category ? formatCategoryName(place.category) : undefined;
    const distanceText = formatPlaceDistance(place, userLocation);
    const photos = place.photoUrls || [];

    return (
      <div
        onClick={() => onClick(place)}
        className={`${themeColors.background.card} mb-3 pb-3 border-b ${themeColors.border.default} last:border-0 cursor-pointer relative`}
      >
        {showPassportStamp && (
          <div className="absolute top-0 right-0 z-10" onClick={(e) => e.stopPropagation()}>
            <PassportStampBadges place={place} size="sm" interactive />
          </div>
        )}
        <div className="flex justify-between items-start mb-0.5 pr-14">
          <div className="flex-1 min-w-0 mr-2">
            <div className="flex items-center gap-2">
              <h3 className={`text-base font-semibold ${themeColors.text.primary} line-clamp-1`}>
                {place.name}
              </h3>
              {place.id.startsWith('temp-') && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded uppercase tracking-tighter flex-shrink-0">
                  Saving...
                </span>
              )}
            </div>
            {showPassportStamp && <PassportStampLabels place={place} className="mt-0.5" />}
          </div>
          {place.status !== 'not_visited' && (
            <span
              className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                place.status === 'visited'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : place.status === 'not_going'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}
            >
              {place.status === 'custom' ? place.customStatus : place.status.replace('_', ' ')}
            </span>
          )}
        </div>

        <div
          className={`flex flex-wrap items-center gap-1.5 text-sm ${themeColors.text.secondary} mb-1 line-clamp-2`}
        >
          <span className="flex items-center text-orange-500 font-medium whitespace-nowrap">
            {place.rating || 'New'}
            <Star className="h-3 w-3 fill-current ml-0.5" />
          </span>
          {place.userRatingsTotal && (
            <span className="whitespace-nowrap">({place.userRatingsTotal})</span>
          )}
          {place.priceLevel !== undefined && place.priceLevel !== null && (
            <>
              <span>·</span>
              <span>{formatPrice(place.priceLevel)}</span>
            </>
          )}
          {place.passportCategory && (
            <>
              <span>·</span>
              <span className="truncate max-w-[120px]">{place.passportCategory}</span>
            </>
          )}
          {categoryText && !place.passportCategory && (
            <>
              <span>·</span>
              <span className="truncate max-w-[120px] capitalize">{categoryText}</span>
            </>
          )}
          {place.openNow !== undefined && (
            <>
              <span>·</span>
              <span
                className={
                  isPlaceOpen(place) ? 'text-green-600 font-medium' : 'text-red-600 font-medium'
                }
              >
                {isPlaceOpen(place) ? 'Open' : 'Closed'}
              </span>
            </>
          )}
          {hoursText && (
            <>
              <span>·</span>
              <span className="whitespace-nowrap">{hoursText}</span>
            </>
          )}
          {distanceText && (
            <>
              <span>·</span>
              <span className={themeColors.text.secondary}>{distanceText}</span>
            </>
          )}
        </div>

        {/* Cuisine Chips */}
        {place.cuisines && place.cuisines.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {place.cuisines.map((cuisine) => (
              <span
                key={cuisine}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium capitalize border border-blue-100/50 dark:border-blue-800/50"
              >
                {cuisine}
              </span>
            ))}
          </div>
        )}

        {photos.length > 0 && (
          <div
            className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-hide"
            onClick={(e) => e.stopPropagation()}
          >
            {photos.slice(0, 5).map((photo, i) => (
              <div
                key={i}
                className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"
              >
                <CachedPlacePhoto
                  placeId={place.id}
                  photoRef={photo}
                  photoIndex={i}
                  alt={`${place.name} photo ${i + 1}`}
                  maxWidth={300}
                  maxHeight={300}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {place.notes && (
          <p className={`text-sm ${themeColors.text.primary} mb-1 line-clamp-2`}>{place.notes}</p>
        )}

        <p className={`text-xs ${themeColors.text.secondary} mb-1`}>
          {getPlaceAttribution(place, list)}
        </p>
      </div>
    );
  }
);

MobilePlaceCard.displayName = 'MobilePlaceCard';
