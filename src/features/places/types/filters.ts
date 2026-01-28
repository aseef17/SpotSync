import type { PlaceStatus } from '@/features/places/types/place';

export interface FilterOptions {
  category?: string;
  cuisine?: string;
  minRating?: number;
  maxRating?: number;
  priceLevel?: number;
  openNow?: boolean;
  status?: PlaceStatus;
  customStatus?: string;
  location?: {
    lat: number;
    lng: number;
    radius: number;
  };
  searchQuery?: string;
}
