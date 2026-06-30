import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/11QW5icu14Bpc6xeGz3JTAryJkFGdGZshCn4W5byJImE/gviz/tq?tqx=out:csv';

export const DEFAULT_LIST_ID = 'Gzzf9zOWcEkCxyJx2Mo8';

export const STAMP_NAME_TO_ID = {
  'Anagh Banerjee': 'anagh-banerjee',
  'Stephanie Gamarra': 'stephanie-gamarra',
  'Aya Karpinska': 'aya-karpinska',
  'Tijay Mohammed': 'tijay-mohammed',
  'Autumn Morgan': 'autumn-morgan',
  'Hoda Ramy': 'hoda-ramy',
  'Camila Rosa': 'camila-rosa',
  Sonni: 'sonni',
  'Misha Tyutyunik': 'misha-tyutyunik',
  Vash: 'vash',
  'Aashita Verma': 'aashita-verma',
  'Dawn Xintong Yang': 'dawn-xintong-yang',
  Unknown: 'unknown',
};

export function stampNameToId(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  return STAMP_NAME_TO_ID[trimmed] ?? null;
}

export function stableManualId(name) {
  const hash = createHash('sha256').update(name.trim().toLowerCase()).digest('hex').slice(0, 16);
  return `manual_passport_${hash}`;
}

export function normalizeName(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function loadPassportPlacesJson() {
  const path = join(__dirname, '../data/nyc-passport-places.json');
  return JSON.parse(readFileSync(path, 'utf8')).places;
}

export function resolveGooglePlaceIdFromImport(place) {
  if (place.googlePlaceId) return place.googlePlaceId.replace(/^places\//, '');
  const url = place.googleMapsUrl || '';
  const cidMatch = url.match(/!1s([^!]+)/);
  if (cidMatch?.[1] && !cidMatch[1].startsWith('0x')) {
    return cidMatch[1];
  }
  const placeIdMatch = url.match(/place\/[^/]+\/(@[^/]+,)?data=![^!]*!1s([^!]+)/);
  if (placeIdMatch?.[2]) return placeIdMatch[2];
  return stableManualId(place.name);
}

export function loadGoogleMapsApiKey() {
  const fromEnv = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (fromEnv) return fromEnv;

  try {
    const envPath = join(__dirname, '../../.env');
    const envText = readFileSync(envPath, 'utf8');
    for (const line of envText.split('\n')) {
      const match = line.match(/^VITE_GOOGLE_MAPS_API_KEY=(.+)$/);
      if (match?.[1]) {
        return match[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // ignore
  }

  throw new Error('Missing VITE_GOOGLE_MAPS_API_KEY in environment or .env');
}

export function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

export async function fetchSheetRows() {
  const response = await fetch(SHEET_CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet CSV: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const stamp = (cols[0] || '').trim();
    const title = (cols[1] || '').trim();
    const note = (cols[2] || '').trim();
    const location = (cols[3] || '').trim();
    const tags = (cols[4] || '').trim();
    if (!title) continue;
    rows.push({ stamp, title, note, location, tags });
  }

  return rows;
}

export function formatCategoryName(type) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function extractCuisines(types) {
  if (!types?.length) return undefined;
  const cuisines = types
    .filter((type) => type.endsWith('_restaurant') && type !== 'restaurant')
    .map((type) => type.replace('_restaurant', '').replace(/_/g, ' '));
  return cuisines.length ? cuisines : undefined;
}

const GENERAL_CATEGORIES = [
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
  'library',
  'art_gallery',
  'botanical_garden',
];

export function findGeneralCategory(types) {
  if (!types?.length) return undefined;
  for (const general of GENERAL_CATEGORIES) {
    if (types.includes(general)) return general;
  }
  return types[0];
}

function parsePriceLevel(priceLevel) {
  if (priceLevel === undefined || priceLevel === null) return undefined;
  if (typeof priceLevel === 'number') return priceLevel;
  const priceMap = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return priceMap[priceLevel];
}

export function normalizeOpeningHours(weekdayDescriptions) {
  if (!weekdayDescriptions?.length) return undefined;
  return weekdayDescriptions.map((line) => line.replace(/\u202f/g, ' ').replace(/\u2009/g, ' '));
}

const PLACE_DETAILS_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'photos',
  'types',
  'primaryType',
  'nationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'businessStatus',
  'currentOpeningHours',
  'timeZone',
  'delivery',
  'dineIn',
  'takeout',
  'reservable',
  'servesBeer',
  'servesWine',
  'servesVegetarianFood',
  'servesBreakfast',
  'servesLunch',
  'servesDinner',
  'servesBrunch',
  'accessibilityOptions',
  'plusCode',
].join(',');

export async function fetchPlaceDetails(apiKey, placeId) {
  const normalized = placeId.replace(/^places\//, '');
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${normalized}?fields=${PLACE_DETAILS_FIELDS}&key=${apiKey}`
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Places API ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

export async function searchPlaceId(apiKey, { name, lat, lng }) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: name,
      locationBias:
        lat && lng
          ? { circle: { center: { latitude: lat, longitude: lng }, radius: 500 } }
          : undefined,
      maxResultCount: 1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Places search ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const place = data.places?.[0];
  if (!place?.id) return null;
  return place.id.replace(/^places\//, '');
}

export function googlePlaceDetailsToFirestore(data) {
  const photoUrls = data.photos
    ?.slice(0, 5)
    .map((photo) => photo.name)
    .filter(Boolean);
  const openingHours = normalizeOpeningHours(data.currentOpeningHours?.weekdayDescriptions);
  const types = data.types ?? (data.primaryType ? [data.primaryType] : undefined);
  const generalCategory = types ? findGeneralCategory(types) : undefined;
  const category = generalCategory ? formatCategoryName(generalCategory) : undefined;
  const cuisines = types ? extractCuisines(types) : undefined;

  return {
    name: data.displayName?.text || undefined,
    address: data.formattedAddress || undefined,
    location: data.location
      ? { lat: data.location.latitude ?? 0, lng: data.location.longitude ?? 0 }
      : undefined,
    plusCode: data.plusCode?.globalCode ?? undefined,
    rating: data.rating ?? undefined,
    userRatingsTotal: data.userRatingCount ?? undefined,
    priceLevel: parsePriceLevel(data.priceLevel),
    photoUrls: photoUrls?.length ? photoUrls : undefined,
    thumbnailUrl: photoUrls?.[0],
    photoCount: photoUrls?.length,
    types,
    category,
    cuisines,
    phoneNumber: data.nationalPhoneNumber ?? undefined,
    website: data.websiteUri ?? undefined,
    googleMapsUrl: data.googleMapsUri ?? undefined,
    businessStatus: data.businessStatus ?? undefined,
    openNow: data.currentOpeningHours?.openNow ?? undefined,
    openingHours,
    timeZone: data.timeZone?.id ?? undefined,
    delivery: data.delivery ?? undefined,
    dineIn: data.dineIn ?? undefined,
    takeout: data.takeout ?? undefined,
    reservable: data.reservable ?? undefined,
    servesBeer: data.servesBeer ?? undefined,
    servesWine: data.servesWine ?? undefined,
    servesVegetarianFood: data.servesVegetarianFood ?? undefined,
    wheelchairAccessible: data.accessibilityOptions?.wheelchairAccessibleEntrance ?? undefined,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
  };
}

export function omitUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}
