import React from 'react';
import { motion } from 'framer-motion';
import { MapIcon, Star, DollarSign, Edit3 } from 'lucide-react';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { PlaceStatusSelector } from '@/features/places/components/PlaceStatusSelector';
import { formatPrice } from '@/features/places/utils/placeHelpers';
import type { Place } from '@/features/places/types/place';
import type { PlaceList } from '@/features/lists/types/list';
import { themeColors } from '@/styles/colors';

interface PlaceCardProps {
  place: Place;
  list: PlaceList;
  onClick: () => void;
  onStatusChange: () => void;
  layout?: boolean;
  density?: 'comfortable' | 'compact';
}

export const PlaceCard: React.FunctionComponent<PlaceCardProps> = ({
  place,
  list,
  onClick,
  onStatusChange,
  layout = false,
  density = 'compact',
}) => {
  return (
    <motion.div
      layout={layout}
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={{
        hidden: { opacity: 0, scale: 0.95 },
        visible: { opacity: 1, scale: 1 },
      }}
      className={`relative ${themeColors.background.card} rounded-lg shadow-sm border ${themeColors.border.default} hover:shadow-md transition-shadow cursor-pointer flex flex-col`}
      onClick={onClick}
    >
      <div className="aspect-w-16 aspect-h-9 relative bg-gray-100 dark:bg-gray-800 rounded-t-lg overflow-hidden shrink-0">
        {place.photoUrls && place.photoUrls.length > 0 ? (
          <img
            src={GoogleMapsService.getPhotoUrl(place.photoUrls[0], 400, 300)}
            alt={place.name}
            className="w-full h-48 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-48 flex items-center justify-center">
            <MapIcon className={`h-8 w-8 ${themeColors.text.secondary}`} />
          </div>
        )}
      </div>

      <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
        <PlaceStatusSelector
          place={place}
          customStatuses={list.customStatuses}
          onStatusChanged={onStatusChange}
        />
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="mb-2">
          <h3 className={`text-lg font-medium ${themeColors.text.primary} mb-1 line-clamp-1`}>
            {place.name}
          </h3>
          <p className={`text-sm ${themeColors.text.secondary} line-clamp-1`}>{place.address}</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {place.category && (
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium border ${themeColors.border.default} ${themeColors.text.primary}`}
            >
              {place.category}
            </span>
          )}
          {place.cuisines?.slice(0, 3).map((cuisine) => (
            <span
              key={cuisine}
              className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50 capitalize"
            >
              {cuisine}
            </span>
          ))}
          {place.cuisines && place.cuisines.length > 3 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-800">
              +{place.cuisines.length - 3}
            </span>
          )}
        </div>

        <div className={`flex items-center gap-4 text-sm ${themeColors.text.secondary} mb-2`}>
          {place.rating && (
            <div className="flex items-center">
              <Star className="h-4 w-4 text-yellow-400 mr-1" />
              <span>{place.rating}</span>
            </div>
          )}
          {place.priceLevel !== undefined && place.priceLevel !== null && (
            <div className="flex items-center">
              {place.priceLevel > 0 && <DollarSign className="h-4 w-4 mr-1" />}
              <span>{formatPrice(place.priceLevel)}</span>
            </div>
          )}
        </div>

        {place.notes && (
          <div className="mt-2 pt-2 border-t light-border-default">
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
              <Edit3 className="w-3 h-3" />
              <span>Notes</span>
            </div>
            <p
              className={`text-sm ${themeColors.text.secondary} italic bg-gray-50/50 dark:bg-gray-800/50 p-2 rounded-md ${
                density === 'comfortable' ? 'line-clamp-4' : 'line-clamp-2'
              }`}
            >
              "{place.notes}"
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};
