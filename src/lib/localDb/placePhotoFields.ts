import type { Place } from '@/features/places/types/place';

type PlacePhotoSlice = Pick<Place, 'photoUrls' | 'thumbnailUrl' | 'photoCount'>;

function photoUrlsEqual(a?: string[], b?: string[]): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) {
    return false;
  }
  return left.every((url, index) => url === right[index]);
}

/** True when SQL place photo metadata changed and image blobs should be dropped. */
export function didPlacePhotoFieldsChange(
  existing: PlacePhotoSlice | null,
  incoming: Partial<PlacePhotoSlice>
): boolean {
  if (!existing) {
    return (
      incoming.photoUrls !== undefined ||
      incoming.thumbnailUrl !== undefined ||
      incoming.photoCount !== undefined
    );
  }

  if (incoming.photoUrls !== undefined && !photoUrlsEqual(incoming.photoUrls, existing.photoUrls)) {
    return true;
  }
  if (incoming.thumbnailUrl !== undefined && incoming.thumbnailUrl !== existing.thumbnailUrl) {
    return true;
  }
  if (incoming.photoCount !== undefined && incoming.photoCount !== existing.photoCount) {
    return true;
  }

  return false;
}
