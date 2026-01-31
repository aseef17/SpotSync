import React from 'react';
import { Star } from 'lucide-react';
import { themeColors } from '@/styles/colors';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { formatCategoryName } from '@/constants/placeCategories';
import {
  formatPrice,
  getPlaceAttribution,
  getTodayHoursText,
  formatPlaceDistance,
} from '@/features/places/utils/placeHelpers';
import type { Place } from '@/features/places/types/place';
import type { PlaceList } from '@/features/lists/types/list';

interface MobilePlaceCardProps {
  place: Place;
  list: PlaceList;
  userLocation: { lat: number; lng: number } | null;
  onClick: () => void;
}

export const MobilePlaceCard: React.FunctionComponent<MobilePlaceCardProps> = ({
  place,
  list,
  userLocation,
  onClick,
}) => {
  const hoursText = getTodayHoursText(place);
  const categoryText = place.category ? formatCategoryName(place.category) : undefined;
  const distanceText = formatPlaceDistance(place, userLocation);
  const photos = place.photoUrls || [];

  return (
    <div
      onClick={onClick}
      className={`${themeColors.background.card} mb-4 pb-4 border-b ${themeColors.border.default} last:border-0 cursor-pointer`}
    >
      <div className="flex justify-between items-start mb-1">
        <div className="flex-1 min-w-0 mr-2 flex items-center gap-2">
          <h3 className={`text-base font-semibold ${themeColors.text.primary} line-clamp-1`}>
            {place.name}
          </h3>
          {place.id.startsWith('temp-') && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded uppercase tracking-tighter flex-shrink-0">
              Saving...
            </span>
          )}
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

      <div className={`flex items-center gap-1.5 text-sm ${themeColors.text.secondary} mb-1`}>
        <span className="flex items-center text-orange-500 font-medium">
          {place.rating || 'New'}
          <Star className="h-3 w-3 fill-current ml-0.5" />
        </span>
        {place.userRatingsTotal && <span>({place.userRatingsTotal})</span>}
        {place.priceLevel && (
          <>
            <span>·</span>
            <span>{formatPrice(place.priceLevel)}</span>
          </>
        )}
        {categoryText && (
          <>
            <span>·</span>
            <span className="truncate max-w-[150px] capitalize">{categoryText}</span>
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
        <div className="flex flex-wrap gap-1 mb-2">
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

      <div className={`flex items-center gap-1.5 text-sm mb-3`}>
        {place.openNow !== undefined && (
          <span
            className={place.openNow ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}
          >
            {place.openNow ? 'Open' : 'Closed'}
          </span>
        )}

        {place.openNow !== undefined && hoursText && (
          <span className={themeColors.text.secondary}>·</span>
        )}

        {hoursText && <span className={themeColors.text.secondary}>{hoursText}</span>}
      </div>

      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide mb-3">
          {photos.slice(0, 5).map((photo: string, i: number) => (
            <div
              key={i}
              className="flex-shrink-0 w-32 h-32 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
            >
              <img
                src={GoogleMapsService.getPhotoUrl(photo, 300, 300)}
                alt={place.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}

      {place.notes && (
        <p className={`text-sm ${themeColors.text.primary} mb-2 line-clamp-2`}>{place.notes}</p>
      )}

      <p className={`text-xs ${themeColors.text.secondary} mb-3`}>
        {getPlaceAttribution(place, list)}
      </p>
    </div>
  );
};
