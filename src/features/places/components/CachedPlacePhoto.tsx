import React from 'react';
import { usePlacePhotoSrc } from '@/features/places/hooks/usePlacePhotoSrc';

interface CachedPlacePhotoProps {
  placeId: string;
  photoRef: string | undefined;
  photoIndex?: number;
  alt: string;
  className?: string;
  maxWidth?: number;
  maxHeight?: number;
  loading?: 'eager' | 'lazy';
  onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}

export const CachedPlacePhoto: React.FunctionComponent<CachedPlacePhotoProps> = ({
  placeId,
  photoRef,
  photoIndex = 0,
  alt,
  className,
  maxWidth = 400,
  maxHeight = 400,
  loading = 'lazy',
  onError,
}) => {
  const src = usePlacePhotoSrc(placeId, photoRef, photoIndex, { maxWidth, maxHeight });

  if (!src) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={onError}
    />
  );
};
