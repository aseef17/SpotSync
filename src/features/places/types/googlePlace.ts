/**
 * Canonical Google place metadata stored at googlePlaces/{googlePlaceId}.
 * One document per unique Google Place ID (or synthetic manual_* key).
 */
export interface GooglePlace {
  /** Same as Firestore document ID. */
  googlePlaceId: string;
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  plusCode?: string;
  category?: string;
  cuisines?: string[];
  types?: string[];
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  photoUrls?: string[];
  thumbnailUrl?: string;
  photoCount?: number;
  googleMapsUrl?: string;
  openNow?: boolean;
  businessStatus?: string;
  phoneNumber?: string;
  website?: string;
  openingHours?: string[];
  /** IANA timezone for the place (e.g. America/New_York). Used for open/closed checks. */
  timeZone?: string;
  delivery?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  reservable?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesVegetarianFood?: boolean;
  wheelchairAccessible?: boolean;
  /** When Google Places API details were last fetched. */
  detailsFetchedAt?: Date;
  /** NYC Passport stamp design at this location (googlePlaces field for listKind nyc_passport). */
  passportStampId?: string;
  /** Venue type from the community spreadsheet (Library, Museum, etc.). */
  passportCategory?: string;
  createdAt: Date;
  updatedAt: Date;
}
