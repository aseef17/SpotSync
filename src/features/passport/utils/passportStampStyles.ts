import type { PlaceStatus } from '@/features/places/types/place';

export function passportStampImageFilterClass(status: PlaceStatus): string {
  return status === 'visited'
    ? 'opacity-100 saturate-100'
    : 'opacity-100 grayscale contrast-75 brightness-110';
}
