export type PlaceStatus = 'not_visited' | 'visited' | 'not_going' | 'custom';

export interface Place {
  id: string;
  clientId?: string; // Stable ID for UI key tracking to prevent remounts during optimistic updates
  listId: string;
  googlePlaceId?: string;
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
  googleMapsUrl?: string;
  lat?: number;
  lng?: number;
  openNow?: boolean;
  businessStatus?: string;
  phoneNumber?: string;
  website?: string;
  openingHours?: string[];
  delivery?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  reservable?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesVegetarianFood?: boolean;
  wheelchairAccessible?: boolean;
  notes?: string;
  status: PlaceStatus;
  customStatus?: string;
  addedBy: string;
  addedAt: Date;
  updatedAt: Date;
  updatedBy?: string;
  isPreview?: boolean;
}
