import type { GooglePlace } from '@/features/places/types/googlePlace';
import type { Place } from '@/features/places/types/place';

type PassportStampSource = Pick<Place, 'passportStampId' | 'passportStampIds'> &
  Partial<Pick<GooglePlace, 'passportStampId' | 'passportStampIds'>>;

export function mergePassportStampIds(ids: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export function getPassportStampIds(place: PassportStampSource | null | undefined): string[] {
  if (!place) return [];
  if (place.passportStampIds?.length) {
    return mergePassportStampIds(place.passportStampIds);
  }
  if (place.passportStampId) {
    return [place.passportStampId];
  }
  return [];
}

export function primaryPassportStampId(
  place: PassportStampSource | null | undefined
): string | undefined {
  return getPassportStampIds(place)[0];
}

export function placeHasPassportStamp(
  place: PassportStampSource | null | undefined,
  stampId: string
): boolean {
  return getPassportStampIds(place).includes(stampId);
}

export function placeHasAnyPassportStamp(place: PassportStampSource | null | undefined): boolean {
  return getPassportStampIds(place).length > 0;
}
