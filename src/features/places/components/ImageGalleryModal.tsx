import React, { useState, useEffect, useCallback } from 'react';
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

  // Adjust state if initialIndex changes from parent
  if (initialIndex !== prevInitialIndex) {
    setPrevInitialIndex(initialIndex);
    setCurrentIndex(initialIndex);
  }

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
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

  // Handle keyboard navigation
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
      className={`fixed inset-0 z-[60] ${themeColors.background.modalOverlay} flex flex-col items-center justify-center`}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
        <h3 className="text-white font-medium text-lg drop-shadow-md">{placeName}</h3>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-black/20 hover:bg-white/20 text-white transition-colors"
          aria-label="Close gallery"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Main Image */}
      <div className="flex-1 w-full flex items-center justify-center p-4 relative">
        {/* Navigation Buttons */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-4 p-3 rounded-full bg-black/30 hover:bg-white/20 text-white transition-colors z-50"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 p-3 rounded-full bg-black/30 hover:bg-white/20 text-white transition-colors z-50"
              aria-label="Next image"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          </>
        )}

        <div className="relative max-w-full max-h-full">
          <img
            src={images[currentIndex]}
            alt={`${placeName} - ${currentIndex + 1}`}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      </div>

      {/* Footer / Contact Sheet */}
      <div
        className={`w-full ${themeColors.background.card} border-t ${themeColors.border.default} p-4 backdrop-blur-sm overflow-x-auto`}
      >
        <div className="flex justify-center gap-2 min-w-min mx-auto">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${
                idx === currentIndex
                  ? 'border-blue-500 scale-110 z-10'
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        <div className={`text-center text-sm mt-2 ${themeColors.text.secondary}`}>
          {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  );
};
