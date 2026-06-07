import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { themeColors } from '@/styles/colors';

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
  const [activeIndex, setActiveIndex] = useState(0);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const safeIndex = Math.min(activeIndex, Math.max(images.length - 1, 0));

  useEffect(() => {
    thumbnailRefs.current[safeIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [safeIndex]);

  if (images.length === 0) return null;

  const goPrev = () => setActiveIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  const goNext = () => setActiveIndex((i) => (i === images.length - 1 ? 0 : i + 1));

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div
        className={`group relative overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 ${
          compact ? 'aspect-[4/3]' : 'aspect-[16/10]'
        }`}
      >
        <button
          type="button"
          onClick={() => onOpenFullscreen?.(safeIndex)}
          className="h-full w-full"
          aria-label={`View ${placeName} photos`}
        >
          <img
            src={images[safeIndex]}
            alt={`${placeName} photo ${safeIndex + 1}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </button>

        {onOpenFullscreen && (
          <button
            type="button"
            onClick={() => onOpenFullscreen(safeIndex)}
            className="absolute right-2 top-2 rounded-lg bg-black/50 p-2 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
            aria-label="Open fullscreen gallery"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition-colors hover:bg-black/60"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition-colors hover:bg-black/60"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <>
          <div className="w-full overflow-x-auto scrollbar-hide">
            <div className="mx-auto flex w-max min-w-full justify-center gap-2 px-1">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  ref={(el) => {
                    thumbnailRefs.current[idx] = el;
                  }}
                  onClick={() => setActiveIndex(idx)}
                  className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                    idx === safeIndex
                      ? 'border-blue-500 ring-2 ring-blue-500/30'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
          <p className={`text-center text-sm tabular-nums ${themeColors.text.secondary}`}>
            {safeIndex + 1} / {images.length}
          </p>
        </>
      )}
    </div>
  );
};
