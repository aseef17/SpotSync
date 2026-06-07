import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { themeColors } from '@/styles/colors';

interface ImageGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
  placeName: string;
}

export const ImageGalleryModal: React.FunctionComponent<ImageGalleryModalProps> = ({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
  placeName,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);

  if (initialIndex !== prevInitialIndex) {
    setPrevInitialIndex(initialIndex);
    setCurrentIndex(initialIndex);
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;

    const thumb = thumbnailRefs.current[currentIndex];
    const strip = thumbnailStripRef.current;
    if (!thumb || !strip) return;

    const thumbCenter = thumb.offsetLeft + thumb.offsetWidth / 2;
    strip.scrollLeft = thumbCenter - strip.clientWidth / 2;
  }, [currentIndex, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  if (!isOpen) return null;

  if (images.length === 0) return null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex h-dvh max-h-dvh flex-col overflow-hidden ${themeColors.background.modalOverlay}`}
    >
      <div className="flex shrink-0 items-center justify-between bg-gradient-to-b from-black/50 to-transparent p-4">
        <h3 className="text-lg font-medium text-white drop-shadow-md">{placeName}</h3>
        <button
          onClick={onClose}
          className="rounded-full bg-black/20 p-2 text-white transition-colors hover:bg-white/20"
          aria-label="Close gallery"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-2">
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-4 z-50 rounded-full bg-black/30 p-3 text-white transition-colors hover:bg-white/20"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 z-50 rounded-full bg-black/30 p-3 text-white transition-colors hover:bg-white/20"
              aria-label="Next image"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          </>
        )}

        <img
          src={images[currentIndex]}
          alt={`${placeName} - ${currentIndex + 1}`}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
      </div>

      <div
        className={`shrink-0 border-t ${themeColors.border.default} ${themeColors.background.card} px-4 pb-4 pt-3 backdrop-blur-sm`}
      >
        <div ref={thumbnailStripRef} className="w-full overflow-x-auto scrollbar-hide">
          <div className="mx-auto flex w-max min-w-full justify-center gap-2">
            {images.map((img, idx) => (
              <button
                key={idx}
                type="button"
                ref={(el) => {
                  thumbnailRefs.current[idx] = el;
                }}
                onClick={() => setCurrentIndex(idx)}
                className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                  idx === currentIndex
                    ? 'z-10 border-blue-500'
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
        <p className={`mt-3 text-center text-sm tabular-nums ${themeColors.text.secondary}`}>
          {currentIndex + 1} / {images.length}
        </p>
      </div>
    </div>
  );
};
