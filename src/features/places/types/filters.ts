import type { PlaceStatus } from '@/features/places/types/place';

export interface FilterOptions {
  category?: string | string[];
  cuisine?: string;
  /** NYC Passport: filter by stamp artist/design id. */
  passportStamp?: string | string[];
  /** NYC Passport: filter by venue type tag (Library, Museum, etc.). */
  passportCategory?: string | string[];
  /** NYC Passport: show only places linked to a stamp artist. */
  passportHasStamp?: boolean;
  minRating?: number;
  maxRating?: number;
  priceLevel?: number[];
  openNow?: boolean;
  status?: PlaceStatus;
  customStatus?: string;
  location?: {
    lat: number;
    lng: number;
    radius: number;
  };
  searchQuery?: string;
  sortBy?: 'name' | 'name-desc' | 'rating' | 'date' | 'price' | 'distance';
  sortDirection?: 'asc' | 'desc';
}
