import type { Place } from '@/features/places/types/place';
import type { LegacyGooglePlace } from '@/features/places/api/googleMapsService';
import {
  formatCategoryName,
  extractCuisines,
  findGeneralCategory,
} from '@/constants/placeCategories';

/**
 * Creates a unified Place object from Google Maps details.
 * Ensures consistent handling of:
 * - ClientID generation
 * - Category formatting
 * - Open/Closed status
 * - Default fields
 */
export const createPlaceFromGoogleDetails = (
  googlePlace: LegacyGooglePlace,
  listId: string,
  userId: string,
  overrides: Partial<Place> = {}
): Place => {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const clientId = overrides.clientId || tempId;

  let photoUrls: string[] = [];
  if (googlePlace.photos && Array.isArray(googlePlace.photos)) {
    photoUrls = googlePlace.photos
      .slice(0, 10)
      .map((photo) => {
        if (typeof photo.getUrl === 'function') {
          return photo.getUrl({ maxWidth: 400, maxHeight: 300 });
        }
        return typeof photo.getUrl === 'string' ? photo.getUrl : '';
      })
      .filter((url) => !!url);
  }

  let category = googlePlace.category;
  let cuisines = googlePlace.cuisines;

  if (googlePlace.types && googlePlace.types.length > 0) {
    if (!category) {
      const generalType = findGeneralCategory(googlePlace.types);
      if (generalType) {
        category = formatCategoryName(generalType);
      }
    } else {
      category = formatCategoryName(category);
    }

    if (!cuisines || cuisines.length === 0) {
      cuisines = extractCuisines(googlePlace.types);
    }
  }

  let openNow: boolean | undefined = undefined;
  if (googlePlace.opening_hours && googlePlace.opening_hours.open_now !== undefined) {
    openNow = googlePlace.opening_hours.open_now;
  }

  const placeData: Place = {
    id: overrides.id || tempId,
    clientId,
    listId,
    googlePlaceId: googlePlace.place_id,
    name: googlePlace.name || '',
    address: googlePlace.formatted_address || '',
    location: {
      lat:
        typeof googlePlace.geometry?.location?.lat === 'function'
          ? googlePlace.geometry.location.lat()
          : googlePlace.geometry?.location?.lat || 0,
      lng:
        typeof googlePlace.geometry?.location?.lng === 'function'
          ? googlePlace.geometry.location.lng()
          : googlePlace.geometry?.location?.lng || 0,
    },
    photoUrls,
    addedBy: userId,
    status: 'not_visited',
    addedAt: new Date(),
    updatedAt: new Date(),

    plusCode: googlePlace.plus_code?.global_code,
    types: googlePlace.types,
    category,
    cuisines,
    openNow,
    businessStatus: googlePlace.business_status,
    userRatingsTotal: googlePlace.user_ratings_total,
    delivery: googlePlace.delivery,
    dineIn: googlePlace.dine_in,
    takeout: googlePlace.takeout,
    reservable: googlePlace.reservable,
    servesBeer: googlePlace.serves_beer,
    servesWine: googlePlace.serves_wine,
    servesVegetarianFood: googlePlace.serves_vegetarian_food,
    wheelchairAccessible: googlePlace.wheelchair_accessible_entrance,
    rating: googlePlace.rating,
    googleMapsUrl: googlePlace.url,
    phoneNumber: googlePlace.formatted_phone_number,
    website: googlePlace.website,
    openingHours: googlePlace.opening_hours?.weekday_text,
    priceLevel: googlePlace.price_level,

    ...overrides,
  };

  // Remove undefined fields to keep object clean for Firestore
  Object.keys(placeData).forEach((key) => {
    if (placeData[key as keyof Place] === undefined) {
      delete placeData[key as keyof Place];
    }
  });

  return placeData;
};
