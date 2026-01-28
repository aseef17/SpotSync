/**
 * Google Places API v1 Category Mappings
 * Based on: https://developers.google.com/maps/documentation/places/web-service/place-types
 *
 * Table A: Primary types that can be used for filtering
 * Table B: Additional descriptive types
 */

export const PLACE_CATEGORIES = {
  // Food & Drink
  FOOD_AND_DRINK: [
    'american_restaurant',
    'bakery',
    'bar',
    'barbecue_restaurant',
    'brazilian_restaurant',
    'breakfast_restaurant',
    'brunch_restaurant',
    'cafe',
    'chinese_restaurant',
    'coffee_shop',
    'fast_food_restaurant',
    'french_restaurant',
    'greek_restaurant',
    'hamburger_restaurant',
    'ice_cream_shop',
    'indian_restaurant',
    'indonesian_restaurant',
    'italian_restaurant',
    'japanese_restaurant',
    'korean_restaurant',
    'lebanese_restaurant',
    'meal_delivery',
    'meal_takeaway',
    'mediterranean_restaurant',
    'mexican_restaurant',
    'middle_eastern_restaurant',
    'pizza_restaurant',
    'ramen_restaurant',
    'restaurant',
    'sandwich_shop',
    'seafood_restaurant',
    'spanish_restaurant',
    'steak_house',
    'sushi_restaurant',
    'thai_restaurant',
    'turkish_restaurant',
    'vegan_restaurant',
    'vegetarian_restaurant',
    'vietnamese_restaurant',
  ],

  // Entertainment & Recreation
  ENTERTAINMENT: [
    'amusement_center',
    'amusement_park',
    'aquarium',
    'banquet_hall',
    'bowling_alley',
    'casino',
    'community_center',
    'convention_center',
    'cultural_center',
    'dog_park',
    'event_venue',
    'hiking_area',
    'historical_landmark',
    'marina',
    'movie_rental',
    'movie_theater',
    'national_park',
    'night_club',
    'park',
    'tourist_attraction',
    'visitor_center',
    'wedding_venue',
    'zoo',
  ],

  // Culture
  CULTURE: ['art_gallery', 'museum', 'performing_arts_theater', 'library', 'planetarium'],

  // Shopping
  SHOPPING: [
    'book_store',
    'clothing_store',
    'convenience_store',
    'department_store',
    'discount_store',
    'electronics_store',
    'furniture_store',
    'gift_shop',
    'grocery_store',
    'hardware_store',
    'home_goods_store',
    'home_improvement_store',
    'jewelry_store',
    'liquor_store',
    'market',
    'pet_store',
    'shoe_store',
    'shopping_mall',
    'sporting_goods_store',
    'store',
    'supermarket',
    'wholesaler',
  ],

  // Lodging
  LODGING: [
    'bed_and_breakfast',
    'campground',
    'camping_cabin',
    'cottage',
    'extended_stay_hotel',
    'farmstay',
    'guest_house',
    'hostel',
    'hotel',
    'lodging',
    'motel',
    'private_guest_room',
    'resort_hotel',
    'rv_park',
  ],

  // Health & Wellness
  HEALTH: [
    'dental_clinic',
    'dentist',
    'doctor',
    'drugstore',
    'hospital',
    'medical_lab',
    'pharmacy',
    'physiotherapist',
    'spa',
  ],

  // Services
  SERVICES: [
    'barber_shop',
    'beauty_salon',
    'cemetery',
    'child_care_agency',
    'consultant',
    'courier_service',
    'electrician',
    'florist',
    'funeral_home',
    'hair_care',
    'hair_salon',
    'insurance_agency',
    'laundry',
    'lawyer',
    'locksmith',
    'moving_company',
    'painter',
    'plumber',
    'real_estate_agency',
    'roofing_contractor',
    'storage',
    'tailor',
    'telecommunications_service_provider',
    'travel_agency',
    'veterinary_care',
  ],

  // Sports
  SPORTS: [
    'athletic_field',
    'fitness_center',
    'golf_course',
    'gym',
    'playground',
    'ski_resort',
    'sports_club',
    'sports_complex',
    'stadium',
    'swimming_pool',
  ],

  // Transportation
  TRANSPORTATION: [
    'airport',
    'bus_station',
    'bus_stop',
    'ferry_terminal',
    'heliport',
    'light_rail_station',
    'park_and_ride',
    'parking',
    'rest_stop',
    'subway_station',
    'taxi_stand',
    'train_station',
    'transit_depot',
    'transit_station',
    'truck_stop',
  ],

  // Places of Worship
  WORSHIP: ['church', 'hindu_temple', 'mosque', 'synagogue'],
} as const;

export const CATEGORY_ICONS: Record<string, string> = {
  // Food & Drink
  restaurant: 'Utensils',
  cafe: 'Coffee',
  coffee_shop: 'Coffee',
  bar: 'Beer',
  night_club: 'Beer',
  pizza_restaurant: 'Pizza',
  
  // Shopping
  store: 'ShoppingBag',
  clothing_store: 'ShoppingBag',
  shopping_mall: 'ShoppingBag',
  grocery_store: 'ShoppingCart',
  supermarket: 'ShoppingCart',
  grocery_or_supermarket: 'ShoppingCart',
  
  // Entertainment
  movie_theater: 'Film',
  art_gallery: 'Landmark',
  museum: 'Landmark',
  park: 'Palmtree',
  zoo: 'Palmtree',
  hiking_area: 'Mountain',
  gym: 'Zap', // Activity/Energy
  stadium: 'Flag',
  
  // Lodging
  hotel: 'Bed',
  lodging: 'Bed',
  
  // Travel
  airport: 'Plane',
  train_station: 'Train',
  bus_station: 'Bus', // check if Bus exists, else Car
  
  // Services
  hospital: 'Heart',
  pharmacy: 'Heart',
  bank: 'Briefcase',
};

export const CATEGORY_GROUP_ICONS: Record<string, string> = {
  FOOD_AND_DRINK: 'Utensils',
  ENTERTAINMENT: 'Ticket', // Check if Ticket exists, or Film
  CULTURE: 'Landmark',
  SHOPPING: 'ShoppingBag',
  LODGING: 'Bed',
  HEALTH: 'Heart',
  SERVICES: 'Briefcase',
  SPORTS: 'Award',
  TRANSPORTATION: 'Car',
  WORSHIP: 'Home',
};

// Helper to get category group
export function getCategoryGroup(primaryType: string): string | null {
  for (const [group, types] of Object.entries(PLACE_CATEGORIES)) {
    if ((types as readonly string[]).includes(primaryType)) {
      return group;
    }
  }
  return null;
}

// Helper to normalize category key (e.g. "Coffee Shop" -> "coffee_shop")
function normalizeCategory(category: string): string {
  return category.toLowerCase().trim().replace(/\s+/g, '_');
}

export function getIconForCategory(category: string): string {
  const key = normalizeCategory(category);
  
  // 1. Check specific category mapping
  if (CATEGORY_ICONS[key]) {
    return CATEGORY_ICONS[key];
  }
  if (CATEGORY_ICONS[category]) {
    return CATEGORY_ICONS[category];
  }

  // 2. Check group mapping
  const group = getCategoryGroup(key) || getCategoryGroup(category);
  if (group && CATEGORY_GROUP_ICONS[group]) {
    return CATEGORY_GROUP_ICONS[group];
  }

  return 'MapPin';
}

export const CATEGORY_COLORS: Record<string, string> = {
  park: 'Green',
  hiking_area: 'Green',
  gym: 'Green',
  hospital: 'Red',
  pharmacy: 'Red',
  police: 'Blue',
  post_office: 'Blue',
  school: 'Teal',
  university: 'Teal',
  supermarket: 'Teal',
  grocery_store: 'Teal',
  grocery_or_supermarket: 'Teal',
};

export const CATEGORY_GROUP_COLORS: Record<string, string> = {
  FOOD_AND_DRINK: 'Orange',
  ENTERTAINMENT: 'Purple',
  CULTURE: 'Pink',
  SHOPPING: 'Blue',
  LODGING: 'Red',
  HEALTH: 'Teal',
  SERVICES: 'Gray',
  SPORTS: 'Green',
  TRANSPORTATION: 'Teal',
  WORSHIP: 'Gray',
};

export function getCategoryColor(category: string): string {
  const key = normalizeCategory(category);

  // 1. Check specific category mapping
  if (CATEGORY_COLORS[key]) {
    return CATEGORY_COLORS[key];
  }
  if (CATEGORY_COLORS[category]) {
    return CATEGORY_COLORS[category];
  }

  // 2. Check group mapping
  const group = getCategoryGroup(key) || getCategoryGroup(category);
  if (group && CATEGORY_GROUP_COLORS[group]) {
    return CATEGORY_GROUP_COLORS[group];
  }

  // 3. Fallback
  return 'Blue';
}

// Helper to get human-readable category name
export function formatCategoryName(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

// Extract cuisines (plural) from restaurant types
export function extractCuisines(types: string[]): string[] {
  return types
    .filter((t) => t.endsWith('_restaurant') && t !== 'restaurant')
    .map((t) => t.replace('_restaurant', '').replace(/_/g, ' '));
}

// Extract cuisine (legacy single) from restaurant types
export function extractCuisine(types: string[]): string | undefined {
  const cuisines = extractCuisines(types);
  return cuisines.length > 0 ? cuisines[0] : undefined;
}

/**
 * Find the most general category from a list of Google Place types
 * Prioritizes general types (restaurant, cafe, bar) over specific ones (chinese_restaurant)
 */
export function findGeneralCategory(types: string[]): string | undefined {
  // Priority list of general categories
  const generalCategories = [
    'restaurant',
    'cafe',
    'bar',
    'supermarket',
    'grocery_or_supermarket',
    'clothing_store',
    'department_store',
    'electronics_store',
    'museum',
    'park',
    'hotel',
    'gym',
    'spa',
    'store',
    'shopping_mall',
  ];

  // First, try to find a general category
  for (const general of generalCategories) {
    if (types.includes(general)) {
      return general;
    }
  }

  // If no general type found, return the first type that exists in our PLACE_CATEGORIES
  for (const type of types) {
    const group = getCategoryGroup(type);
    if (group) {
      return type;
    }
  }

  // Fallback to first type
  return types[0];
}
