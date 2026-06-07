import { useEffect, useState } from 'react';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { getPlacePhotoDisplayUrl } from '@/features/places/utils/placeHelpers';
import { loadPlacePhotoBlob } from '@/lib/localDb/placePhotoCache';

interface UsePlacePhotoSrcOptions {
  maxWidth?: number;
  maxHeight?: number;
}

export function usePlacePhotoSrc(
  placeId: string | undefined,
  photoRef: string | undefined,
  photoIndex = 0,
  options: UsePlacePhotoSrcOptions = {}
): string | undefined {
  const { maxWidth = 400, maxHeight = 400 } = options;
  const [src, setSrc] = useState<string | undefined>();

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;

    const resolve = async () => {
      if (!placeId || !photoRef) {
        setSrc(undefined);
        return;
      }

      const blob = await loadPlacePhotoBlob(placeId, photoRef, photoIndex, maxWidth, maxHeight);
      if (cancelled) {
        return;
      }

      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        return;
      }

      const fallback = getPlacePhotoDisplayUrl(
        photoRef,
        GoogleMapsService.getPhotoUrl,
        maxWidth,
        maxHeight
      );
      setSrc(fallback || undefined);
    };

    void resolve();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [placeId, photoRef, photoIndex, maxWidth, maxHeight]);

  return src;
}
