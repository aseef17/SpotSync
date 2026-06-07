import React from 'react';
import { CachedPlacePhoto } from '@/features/places/components/CachedPlacePhoto';

const MAX_SLOTS = 4;

interface PlacePhotoGalleryProps {
  placeId: string;
  photoRefs: string[];
  placeName: string;
  compact?: boolean;
  onOpenFullscreen?: (index: number) => void;
}

export const PlacePhotoGallery: React.FunctionComponent<PlacePhotoGalleryProps> = ({
  placeId,
  photoRefs,
  placeName,
  compact = false,
  onOpenFullscreen,
}) => {
  if (photoRefs.length === 0) return null;

  const maxSlots = compact ? 3 : MAX_SLOTS;
  const hasOverflow = photoRefs.length > maxSlots;
  const visibleCount = hasOverflow ? maxSlots - 1 : photoRefs.length;
  const overflowCount = photoRefs.length - visibleCount;

  const tileClass =
    'relative min-w-0 flex-1 aspect-square overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  return (
    <div className="flex w-full gap-1.5">
      {photoRefs.slice(0, visibleCount).map((photoRef, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onOpenFullscreen?.(idx)}
          className={`${tileClass} bg-gray-100 dark:bg-gray-800`}
          aria-label={`View ${placeName} photo ${idx + 1}`}
        >
          <CachedPlacePhoto
            placeId={placeId}
            photoRef={photoRef}
            photoIndex={idx}
            alt={`${placeName} photo ${idx + 1}`}
            maxWidth={600}
            maxHeight={600}
            className="h-full w-full object-cover transition-opacity hover:opacity-90"
          />
        </button>
      ))}
      {hasOverflow && (
        <button
          type="button"
          onClick={() => onOpenFullscreen?.(visibleCount)}
          className={`${tileClass} bg-gray-900`}
          aria-label={`View ${overflowCount} more photos`}
        >
          <CachedPlacePhoto
            placeId={placeId}
            photoRef={photoRefs[visibleCount]}
            photoIndex={visibleCount}
            alt=""
            maxWidth={600}
            maxHeight={600}
            className="h-full w-full object-cover opacity-40"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-base font-semibold text-white">
            +{overflowCount}
          </span>
        </button>
      )}
    </div>
  );
};
