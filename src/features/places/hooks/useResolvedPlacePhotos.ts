import { useEffect, useState } from 'react';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { getPlacePhotoDisplayUrl } from '@/features/places/utils/placeHelpers';
import { loadPlacePhotoBlob } from '@/lib/localDb/placePhotoCache';

export function useResolvedPlacePhotos(
  placeId: string | undefined,
  photoRefs: string[],
  maxWidth = 600,
  maxHeight = 600
): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  const refsKey = photoRefs.join('\u0000');

  useEffect(() => {
    const objectUrls: string[] = [];
    let cancelled = false;

    const resolve = async () => {
      if (!placeId || photoRefs.length === 0) {
        setUrls([]);
        return;
      }

      const resolved = await Promise.all(
        photoRefs.map(async (photoRef, photoIndex) => {
          const blob = await loadPlacePhotoBlob(placeId, photoRef, photoIndex, maxWidth, maxHeight);
          if (cancelled) {
            return '';
          }
          if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            objectUrls.push(objectUrl);
            return objectUrl;
          }

          return (
            getPlacePhotoDisplayUrl(photoRef, GoogleMapsService.getPhotoUrl, maxWidth, maxHeight) ||
            ''
          );
        })
      );

      if (!cancelled) {
        setUrls(resolved.filter((url) => url.length > 0));
      }
    };

    void resolve();

    return () => {
      cancelled = true;
      for (const objectUrl of objectUrls) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [placeId, refsKey, maxWidth, maxHeight]);

  return urls;
}
