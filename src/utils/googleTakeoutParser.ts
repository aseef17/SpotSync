import { logger } from "@/utils/logger";

export interface ParsedPlace {
  title: string;
  address?: string;
  url?: string;
  location?: {
    lat: number;
    lng: number;
  };
  googlePlaceId?: string; // Sometimes Takeout includes this
  placeId?: string | null; // Extracted from URL
  comment?: string; // User notes
  phoneNumber?: string;
  website?: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  photoUrls?: string[];
  category?: string;
  types?: string[];
  cuisines?: string[];
  openingHours?: string[];
  delivery?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  reservable?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesVegetarianFood?: boolean;
  wheelchairAccessible?: boolean;
}

interface GeoJSONFeature {
  type: string;
  properties?: {
    Title?: string;
    name?: string;
    Address?: string;
    formatted_address?: string;
    'Google Maps URL'?: string;
    [key: string]: unknown;
  };
  geometry?: {
    type: string;
    coordinates: number[];
  };
}

// Type guard for GeoJSONFeature
function isGeoJSONFeature(obj: unknown): obj is GeoJSONFeature {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    'type' in o &&
    (o.properties === undefined || typeof o.properties === 'object') &&
    (o.geometry === undefined || typeof o.geometry === 'object')
  );
}

export const parseTakeoutJson = (jsonContent: string): ParsedPlace[] => {
  try {
    const data = JSON.parse(jsonContent);
    const features = data.features;

    if (!Array.isArray(features)) {
      logger.warn('Invalid GeoJSON format: features array missing');
      return [];
    }

    return features.filter(isGeoJSONFeature).map((f) => {
      const props = f.properties || {};
      
      const place: ParsedPlace = {
        title: props.Title || props.name || 'Unknown Place',
        address: props['Address'] || props['formatted_address'],
        url: props['Google Maps URL'],
      };

      // Extract coordinates (GeoJSON is usually [lng, lat])
      if (f.geometry && f.geometry.type === 'Point' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
        place.location = {
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        };
      }

      return place;
    });
  } catch (error) {
    logger.error('Failed to parse Takeout JSON:', error);
    return [];
  }
};
