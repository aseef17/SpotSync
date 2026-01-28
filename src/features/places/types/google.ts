export interface GooglePlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  plus_code?: {
    compound_code: string;
    global_code: string;
  };
  rating?: number;
  price_level?: number;
  photos?: Array<{
    photo_reference: string;
    width: number;
    height: number;
  }>;
  types?: string[];
  url?: string;
  formatted_phone_number?: string;
  website?: string;
  opening_hours?: {
    weekday_text?: string[];
  };
}
