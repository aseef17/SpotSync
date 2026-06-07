import type { Place } from '@/features/places/types/place';
import { logger } from '@/utils/logger';
import {
  extractCuisines,
  formatCategoryName,
  findGeneralCategory,
} from '@/constants/placeCategories';
import { getDoc, setDoc } from 'firebase/firestore';
import { googlePlaceDocRef } from '@/features/places/api/googlePlaceFirestore';
import { normalizeGooglePlaceId } from '@/features/places/constants/firestorePaths';
import type { GooglePlace as CanonicalGooglePlace } from '@/features/places/types/googlePlace';
import { normalizeOpeningHours } from '@/features/places/utils/openingHoursUtils';
import { buildGooglePlacePayload } from '@/features/places/utils/placeWriteSplit';

interface GoogleLocation {
  latitude: number;
  longitude: number;
}

interface GooglePhoto {
  name: string;
}

interface GoogleDisplayName {
  text: string;
}

interface GooglePlace {
  id: string;
  displayName?: GoogleDisplayName;
  formattedAddress?: string;
  location?: GoogleLocation;
  rating?: number;
  priceLevel?: number;
  types?: string[];
  primaryType?: string; // NEW: Single authoritative category
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  photos?: GooglePhoto[];
  openingHours?: {
    weekdayDescriptions?: string[];
  };
  // New API v1 fields
  businessStatus?: string;
  userRatingCount?: number;
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  // Service options
  delivery?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  curbsidePickup?: boolean;
  reservable?: boolean;
  // Food & drink
  servesBeer?: boolean;
  servesWine?: boolean;
  servesVegetarianFood?: boolean;
  servesBreakfast?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesBrunch?: boolean;
  accessibilityOptions?: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
  timeZone?: {
    id?: string;
  };
}

interface GooglePlacesSearchResponse {
  places?: GooglePlace[];
}

export interface LegacyGooglePlace {
  place_id: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  price_level?: number;
  types?: string[];
  category?: string;
  cuisines?: string[];
  geometry?: {
    location: {
      lat: number | (() => number);
      lng: number | (() => number);
    };
  };
  plus_code?: {
    compound_code: string;
    global_code: string;
  };
  url?: string;
  formatted_phone_number?: string;
  website?: string;
  photos?: Array<{ getUrl: string | ((opts: { maxWidth: number; maxHeight: number }) => string) }>;
  opening_hours?: {
    weekday_text?: string[];
    open_now?: boolean;
  };
  business_status?: string;
  user_ratings_total?: number;
  delivery?: boolean;
  dine_in?: boolean;
  takeout?: boolean;
  curbside_pickup?: boolean;
  reservable?: boolean;
  serves_beer?: boolean;
  serves_wine?: boolean;
  serves_vegetarian_food?: boolean;
  serves_breakfast?: boolean;
  serves_lunch?: boolean;
  serves_dinner?: boolean;
  serves_brunch?: boolean;
  wheelchair_accessible_entrance?: boolean;
  time_zone?: string;
}

export class GoogleMapsService {
  private static google: Record<string, unknown> | null = null;
  private static apiKey: string | undefined;

  static async initialize(): Promise<void> {
    if (this.google === null) {
      this.apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
      if (!this.apiKey) {
        throw new Error(
          'Missing Google Maps API key. Set VITE_GOOGLE_MAPS_API_KEY in .env and restart the dev server.'
        );
      }
      this.google = {};
    }
  }

  static canonicalGooglePlaceToLegacy(gp: CanonicalGooglePlace): LegacyGooglePlace {
    const { lat, lng } = gp.location;

    return {
      place_id: gp.googlePlaceId,
      name: gp.name,
      formatted_address: gp.address,
      rating: gp.rating,
      price_level: gp.priceLevel,
      types: gp.types,
      category: gp.category,
      cuisines: gp.cuisines,
      geometry: {
        location: {
          lat: () => lat,
          lng: () => lng,
        },
      },
      photos: gp.photoUrls?.map((url) => ({ getUrl: url })) ?? [],
      url: gp.googleMapsUrl,
      formatted_phone_number: gp.phoneNumber,
      website: gp.website,
      opening_hours: {
        weekday_text: gp.openingHours,
        open_now: gp.openNow,
      },
      time_zone: gp.timeZone,
      business_status: gp.businessStatus,
      user_ratings_total: gp.userRatingsTotal,
      delivery: gp.delivery,
      dine_in: gp.dineIn,
      takeout: gp.takeout,
      reservable: gp.reservable,
      serves_beer: gp.servesBeer,
      serves_wine: gp.servesWine,
      serves_vegetarian_food: gp.servesVegetarianFood,
      wheelchair_accessible_entrance: gp.wheelchairAccessible,
    };
  }

  static extractPhotoResourceNames(place: LegacyGooglePlace, limit = 10): string[] {
    if (!place.photos?.length) {
      return [];
    }

    return place.photos.slice(0, limit).map((photo) => {
      const photoUrlObj = photo.getUrl;
      if (typeof photoUrlObj === 'function') {
        return photoUrlObj({ maxWidth: 1200, maxHeight: 1200 });
      }
      return String(photoUrlObj);
    });
  }

  /** True when the ID is a Places API resource id (ChIJ…), not a legacy numeric CID. */
  static isCanonicalGooglePlaceId(placeId: string): boolean {
    if (!placeId) return false;
    if (/^ChIJ[\w-]+$/.test(placeId)) return true;
    if (placeId.startsWith('places/')) return true;
    if (placeId.startsWith('plus_') || placeId.startsWith('manual_')) return true;
    if (/^\d+$/.test(placeId)) return false;
    return placeId.length > 12;
  }

  private static async readCachedPlaceDetails(placeId: string): Promise<LegacyGooglePlace | null> {
    const normalizedPlaceId = normalizeGooglePlaceId(placeId);

    try {
      const cacheSnap = await getDoc(googlePlaceDocRef(normalizedPlaceId));
      if (!cacheSnap.exists()) {
        return null;
      }

      const cachedData = cacheSnap.data();
      const fetchedAt = cachedData.detailsFetchedAt ?? cachedData.updatedAt;
      if (fetchedAt && Date.now() - fetchedAt.getTime() < 30 * 24 * 60 * 60 * 1000) {
        logger.info(`Using cached place details for ${normalizedPlaceId}`);
        return this.canonicalGooglePlaceToLegacy(cachedData);
      }
    } catch (e) {
      logger.error('Error reading from googlePlaces cache:', e);
    }

    return null;
  }

  /**
   * Resolves canonical place details for import: checks googlePlaces cache first,
   * skips API calls for non-canonical CIDs, then falls back to text search.
   */
  static async resolvePlaceDetailsForImport(input: {
    placeId?: string | null;
    googlePlaceId?: string | null;
    title: string;
    location?: { lat: number; lng: number };
  }): Promise<{ details: LegacyGooglePlace | null; canonicalId?: string }> {
    await this.initialize();

    const candidateIds = [input.placeId, input.googlePlaceId].filter((id): id is string =>
      Boolean(id && this.isCanonicalGooglePlaceId(id))
    );

    const uniqueCandidates = [...new Set(candidateIds)];

    for (const id of uniqueCandidates) {
      const cached = await this.readCachedPlaceDetails(id);
      if (cached) {
        return { details: cached, canonicalId: cached.place_id };
      }
    }

    for (const id of uniqueCandidates) {
      const details = await this.getPlaceDetails(id);
      if (details) {
        return { details, canonicalId: details.place_id };
      }
    }

    if (input.title) {
      try {
        const results = await this.searchPlaces(input.title, input.location);
        if (results.length > 0) {
          const canonicalId = results[0].place_id;
          const cached = await this.readCachedPlaceDetails(canonicalId);
          if (cached) {
            return { details: cached, canonicalId };
          }
          const details = await this.getPlaceDetails(canonicalId);
          return { details, canonicalId: details?.place_id ?? canonicalId };
        }
      } catch (error) {
        logger.warn('Place search failed during import resolve:', error);
      }
    }

    return { details: null };
  }

  static async getPlaceDetails(
    placeId: string,
    options?: { skipCache?: boolean }
  ): Promise<LegacyGooglePlace | null> {
    await this.initialize();

    if (!this.apiKey) {
      throw new Error('Missing Google Maps API key for Places API.');
    }

    const normalizedPlaceId = normalizeGooglePlaceId(placeId);

    if (!options?.skipCache) {
      const cached = await this.readCachedPlaceDetails(normalizedPlaceId);
      if (cached) {
        return cached;
      }
    }

    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${normalizedPlaceId}?fields=id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,photos,types,primaryType,nationalPhoneNumber,websiteUri,googleMapsUri,businessStatus,currentOpeningHours,timeZone,delivery,dineIn,takeout,curbsidePickup,reservable,servesBeer,servesWine,servesVegetarianFood,servesBreakfast,servesLunch,servesDinner,servesBrunch,accessibilityOptions&key=${this.apiKey}`
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Places API get details failed: ${response.status} ${text}`);
      }

      const data: GooglePlace = await response.json();

      // Normalize to legacy-like shape for consistency
      const legacyPlace: LegacyGooglePlace = {
        place_id: normalizeGooglePlaceId(data.id),
        name: data.displayName?.text,
        formatted_address: data.formattedAddress,
        rating: data.rating,
        price_level: data.priceLevel,
        types: data.types,
        category: findGeneralCategory(data.types || []) || data.primaryType,
        cuisines: data.types ? extractCuisines(data.types) : [],
        geometry: {
          location: {
            lat: data.location?.latitude ?? 0,
            lng: data.location?.longitude ?? 0,
          },
        },
        photos:
          data.photos?.map((photo) => ({
            getUrl: () => photo.name, // Photo reference
          })) || [],
        url: data.googleMapsUri,
        formatted_phone_number: data.nationalPhoneNumber,
        website: data.websiteUri,
        opening_hours: {
          weekday_text: normalizeOpeningHours(
            data.currentOpeningHours?.weekdayDescriptions || data.openingHours?.weekdayDescriptions
          ),
          open_now: data.currentOpeningHours?.openNow,
        },
        time_zone: data.timeZone?.id,
        // New fields from API v1
        business_status: data.businessStatus,
        user_ratings_total: data.userRatingCount,
        delivery: data.delivery,
        dine_in: data.dineIn,
        takeout: data.takeout,
        curbside_pickup: data.curbsidePickup,
        reservable: data.reservable,
        serves_beer: data.servesBeer,
        serves_wine: data.servesWine,
        serves_vegetarian_food: data.servesVegetarianFood,
        serves_breakfast: data.servesBreakfast,
        serves_lunch: data.servesLunch,
        serves_dinner: data.servesDinner,
        serves_brunch: data.servesBrunch,
        wheelchair_accessible_entrance: data.accessibilityOptions?.wheelchairAccessibleEntrance,
      };

      try {
        const now = new Date();
        const placeFields = this.convertGooglePlaceToPlace(legacyPlace, '');
        const canonicalPlace = buildGooglePlacePayload(
          { ...placeFields, status: 'not_visited', addedAt: now, updatedAt: now },
          normalizedPlaceId,
          { createdAt: now, updatedAt: now }
        );
        await setDoc(
          googlePlaceDocRef(normalizedPlaceId),
          { ...canonicalPlace, detailsFetchedAt: now },
          { merge: true }
        );
      } catch (e) {
        logger.error('Error writing to googlePlaces cache:', e);
      }

      // Restore functions for the rest of the app to use
      legacyPlace.geometry = {
        location: {
          lat: () => data.location?.latitude ?? 0,
          lng: () => data.location?.longitude ?? 0,
        },
      };

      if (legacyPlace.photos) {
        legacyPlace.photos = legacyPlace.photos.map((p) => ({
          getUrl: typeof p.getUrl === 'string' ? p.getUrl : p.getUrl,
        }));
      }

      return legacyPlace;
    } catch (error) {
      logger.error('Failed to get place details:', error);
      return null;
    }
  }

  static async searchPlaces(
    query: string,
    location?: { lat: number; lng: number }
  ): Promise<LegacyGooglePlace[]> {
    await this.initialize();

    if (!this.apiKey) {
      throw new Error('Missing Google Maps API key for Places API.');
    }

    const body: Record<string, unknown> = {
      textQuery: query,
    };

    if (location) {
      body.locationBias = {
        circle: {
          center: { latitude: location.lat, longitude: location.lng },
          radius: 50000, // 50km
        },
      };
    }

    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.types,places.primaryType,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.photos,places.businessStatus,places.userRatingCount,places.currentOpeningHours,places.timeZone,places.delivery,places.dineIn,places.takeout,places.curbsidePickup,places.reservable,places.servesBeer,places.servesWine,places.servesVegetarianFood,places.servesBreakfast,places.servesLunch,places.servesDinner,places.servesBrunch,places.accessibilityOptions',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error('Places API error:', response.status, text);
        throw new Error(`Places API text search failed: ${response.status} ${text}`);
      }

      const data: GooglePlacesSearchResponse = await response.json();
      const places = data?.places || [];

      // Normalize to legacy-like shape expected by convertGooglePlaceToPlace
      return places.map((p) => ({
        place_id: normalizeGooglePlaceId(p.id),
        name: p.displayName?.text,
        formatted_address: p.formattedAddress,
        rating: p.rating,
        price_level: p.priceLevel,
        types: p.types,
        category: findGeneralCategory(p.types || []) || p.primaryType,
        cuisines: p.types ? extractCuisines(p.types) : [],
        geometry: {
          location: {
            lat: () => p.location?.latitude ?? 0,
            lng: () => p.location?.longitude ?? 0,
          },
        },
        plus_code: undefined,
        url: p.googleMapsUri,
        formatted_phone_number: p.nationalPhoneNumber,
        website: p.websiteUri,
        photos:
          p.photos?.map((photo) => ({
            getUrl: () => photo.name, // Photo reference from API v1
          })) || [],
        opening_hours: {
          weekday_text: normalizeOpeningHours(p.currentOpeningHours?.weekdayDescriptions),
          open_now: p.currentOpeningHours?.openNow,
        },
        time_zone: p.timeZone?.id,
        // New fields from API v1
        business_status: p.businessStatus,
        user_ratings_total: p.userRatingCount,
        delivery: p.delivery,
        dine_in: p.dineIn,
        takeout: p.takeout,
        curbside_pickup: p.curbsidePickup,
        reservable: p.reservable,
        serves_beer: p.servesBeer,
        serves_wine: p.servesWine,
        serves_vegetarian_food: p.servesVegetarianFood,
        serves_breakfast: p.servesBreakfast,
        serves_lunch: p.servesLunch,
        serves_dinner: p.servesDinner,
        serves_brunch: p.servesBrunch,
        wheelchair_accessible_entrance: p.accessibilityOptions?.wheelchairAccessibleEntrance,
      }));
    } catch (error) {
      logger.error('Places API search failed:', error);
      throw error;
    }
  }

  static getPhotoUrl(photoName: string, maxWidth: number = 400, maxHeight: number = 300): string {
    if (!photoName) return '';

    if (photoName.startsWith('http')) return photoName;

    if (photoName.startsWith('places/')) {
      const apiKey = this.apiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        logger.warn('No API key available for photo URL generation');
        return '';
      }
      return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${maxHeight}&maxWidthPx=${maxWidth}&key=${apiKey}`;
    }

    return '';
  }

  static convertGooglePlaceToPlace(
    googlePlace: LegacyGooglePlace,
    listId: string
  ): Omit<Place, 'id' | 'addedAt' | 'updatedAt' | 'status'> {
    // Handle photo URLs - REST API returns photo resource names
    let photoUrls: string[] = [];
    if (googlePlace.photos && Array.isArray(googlePlace.photos)) {
      photoUrls = googlePlace.photos
        .slice(0, 10)
        .map((photo) => {
          // Check if photo has getUrl (old JS API) or is a name (REST API)
          if (typeof photo.getUrl === 'function') {
            return photo.getUrl({ maxWidth: 400, maxHeight: 300 });
          }
          // REST API returns photo resource names - convert to Photo API URLs
          const photoName = typeof photo === 'string' ? photo : String(photo);
          return photoName;
        })
        .filter((url) => !!url);
    }

    // Build the place object, only including defined values to avoid Firestore errors
    const place: Omit<Place, 'id' | 'addedAt' | 'updatedAt' | 'status'> = {
      listId,
      googlePlaceId: googlePlace.place_id,
      name: googlePlace.name || '',
      address: googlePlace.formatted_address || '',
      location: {
        lat:
          typeof googlePlace.geometry?.location?.lat === 'function'
            ? googlePlace.geometry.location.lat()
            : (googlePlace.geometry?.location?.lat as unknown as number) || 0,
        lng:
          typeof googlePlace.geometry?.location?.lng === 'function'
            ? googlePlace.geometry.location.lng()
            : (googlePlace.geometry?.location?.lng as unknown as number) || 0,
      },
      photoUrls,
      addedBy: '',
    };

    // Only add optional fields if they have values
    if (googlePlace.plus_code?.global_code) {
      place.plusCode = googlePlace.plus_code.global_code;
    }
    // Extract category from types array using PLACE_CATEGORIES
    if (googlePlace.types && googlePlace.types.length > 0) {
      // Save all types for metadata
      place.types = googlePlace.types;

      // Find general category (e.g., "restaurant" not "chinese_restaurant")
      const generalType = findGeneralCategory(googlePlace.types);
      if (generalType) {
        place.category = formatCategoryName(generalType);
      }

      // Extract cuisines (plural) for restaurants using helper
      const cuisines = extractCuisines(googlePlace.types);
      if (cuisines && cuisines.length > 0) {
        place.cuisines = cuisines;
      }
    }

    // Extract opening hours and current status
    if (googlePlace.opening_hours && googlePlace.opening_hours.open_now !== undefined) {
      place.openNow = googlePlace.opening_hours.open_now;
    }
    if (googlePlace.business_status) {
      place.businessStatus = googlePlace.business_status;
    }

    // Extract user ratings total (number of reviews)
    if (googlePlace.user_ratings_total) {
      place.userRatingsTotal = googlePlace.user_ratings_total;
    }

    // Extract service options (delivery, dine-in, takeout, etc.)
    if (googlePlace.delivery !== undefined) {
      place.delivery = googlePlace.delivery;
    }
    if (googlePlace.dine_in !== undefined) {
      place.dineIn = googlePlace.dine_in;
    }
    if (googlePlace.takeout !== undefined) {
      place.takeout = googlePlace.takeout;
    }
    if (googlePlace.reservable !== undefined) {
      place.reservable = googlePlace.reservable;
    }
    if (googlePlace.serves_beer !== undefined) {
      place.servesBeer = googlePlace.serves_beer;
    }
    if (googlePlace.serves_wine !== undefined) {
      place.servesWine = googlePlace.serves_wine;
    }
    if (googlePlace.serves_vegetarian_food !== undefined) {
      place.servesVegetarianFood = googlePlace.serves_vegetarian_food;
    }
    if (googlePlace.wheelchair_accessible_entrance !== undefined) {
      place.wheelchairAccessible = googlePlace.wheelchair_accessible_entrance;
    }
    if (googlePlace.rating) {
      place.rating = googlePlace.rating;
    }
    if (googlePlace.price_level) {
      const price = googlePlace.price_level;
      if (typeof price === 'number') {
        place.priceLevel = price;
      } else if (typeof price === 'string') {
        const priceMap: Record<string, number> = {
          PRICE_LEVEL_FREE: 0,
          PRICE_LEVEL_INEXPENSIVE: 1,
          PRICE_LEVEL_MODERATE: 2,
          PRICE_LEVEL_EXPENSIVE: 3,
          PRICE_LEVEL_VERY_EXPENSIVE: 4,
        };
        if (priceMap[price] !== undefined) {
          place.priceLevel = priceMap[price];
        }
      }
    }
    if (googlePlace.url) {
      place.googleMapsUrl = googlePlace.url;
    }
    if (googlePlace.formatted_phone_number) {
      place.phoneNumber = googlePlace.formatted_phone_number;
    }
    if (googlePlace.website) {
      place.website = googlePlace.website;
    }
    if (googlePlace.opening_hours?.weekday_text) {
      place.openingHours = normalizeOpeningHours(googlePlace.opening_hours.weekday_text);
    }
    if (googlePlace.time_zone) {
      place.timeZone = googlePlace.time_zone;
    }

    // Add top-level lat/lng for map integration
    if (place.location?.lat) {
      place.lat = place.location.lat;
    }
    if (place.location?.lng) {
      place.lng = place.location.lng;
    }
    return place;
  }

  static async getUserLocation(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 300000, // 5 minutes
        }
      );
    });
  }

  // Google Maps currently lacks a direct API to access saved places without extensive OAuth scopes.
  // Placeholder for future implementation.
  static async importSavedPlaces(): Promise<LegacyGooglePlace[]> {
    // This is a placeholder for future implementation
    // Would require OAuth consent and Google APIs
    logger.warn('Importing saved places requires OAuth consent and is not yet implemented');
    return [];
  }
}
