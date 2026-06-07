import React from 'react';

const MAX_SLOTS = 4;

interface PlacePhotoGalleryProps {
  images: string[];
  placeName: string;
  compact?: boolean;
  onOpenFullscreen?: (index: number) => void;
}

export const PlacePhotoGallery: React.FunctionComponent<PlacePhotoGalleryProps> = ({
  images,
  placeName,
  compact = false,
  onOpenFullscreen,
}) => {
  if (images.length === 0) return null;

  const maxSlots = compact ? 3 : MAX_SLOTS;
  const hasOverflow = images.length > maxSlots;
  const visibleCount = hasOverflow ? maxSlots - 1 : images.length;
  const overflowCount = images.length - visibleCount;

  const tileClass =
    'relative min-w-0 flex-1 aspect-square overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

  return (
    <div className="flex w-full gap-1.5">
      {images.slice(0, visibleCount).map((img, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onOpenFullscreen?.(idx)}
          className={`${tileClass} bg-gray-100 dark:bg-gray-800`}
          aria-label={`View ${placeName} photo ${idx + 1}`}
        >
          <img
            src={img}
            alt={`${placeName} photo ${idx + 1}`}
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
          <img
            src={images[visibleCount]}
            alt=""
            className="h-full w-full object-cover opacity-40"
            aria-hidden
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-base font-semibold text-white">
            +{overflowCount}
          </span>
        </button>
      )}
    </div>
  );
};
