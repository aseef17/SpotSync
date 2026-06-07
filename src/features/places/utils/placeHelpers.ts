import type { Place } from '@/features/places/types/place';
import type { PlaceList, Collaborator } from '@/features/lists/types/list';
import { formatCategoryName } from '@/constants/placeCategories';
import { isOpenAtTimeFromHoursText } from '@/features/places/utils/openingHoursUtils';
import { getZonedWeekdayName } from '@/features/places/utils/placeTimeUtils';
import { calculateDistance } from '@/utils/geo';

export const getPlaceThumbnail = (place: Place): string | undefined =>
  place.thumbnailUrl || place.photoUrls?.[0];

/** Use stored Firebase/HTTP URLs as-is; only transform Google Places photo resource names. */
export function getPlacePhotoDisplayUrl(
  photoRef: string | undefined,
  resolveGooglePhoto: (ref: string, maxWidth?: number, maxHeight?: number) => string,
  maxWidth = 400,
  maxHeight = 300
): string {
  if (!photoRef) {
    return '';
  }

  const trimmed = photoRef.trim();
  if (!trimmed) {
    return '';
  }

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.includes('firebasestorage.googleapis.com')
  ) {
    return trimmed;
  }

  return resolveGooglePhoto(trimmed, maxWidth, maxHeight);
}

export const formatPrice = (level?: number | string | null) => {
  let numLevel = level;

  if (typeof level === 'string') {
    switch (level) {
      case 'PRICE_LEVEL_FREE':
        numLevel = 0;
        break;
      case 'PRICE_LEVEL_INEXPENSIVE':
        numLevel = 1;
        break;
      case 'PRICE_LEVEL_MODERATE':
        numLevel = 2;
        break;
      case 'PRICE_LEVEL_EXPENSIVE':
        numLevel = 3;
        break;
      case 'PRICE_LEVEL_VERY_EXPENSIVE':
        numLevel = 4;
        break;
      default:
        numLevel = null;
    }
  }

  if (numLevel === 0) return 'Free';
  if (!numLevel || typeof numLevel !== 'number') return null;
  return '$'.repeat(Math.min(numLevel, 4));
};

export const parseTimestamp = (
  ts: Date | string | number | { seconds: number } | { __time__: string } | null | undefined
): Date => {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string') return new Date(ts);
  // Handle Firestore timestamps
  if (typeof ts === 'object' && 'seconds' in ts) return new Date(ts.seconds * 1000);
  // Handle serialized internal format (from user JSON)
  if (typeof ts === 'object' && '__time__' in ts) return new Date(ts.__time__);
  return new Date(); // Fallback
};

export const getPlaceAttribution = (place: Place, list: PlaceList) => {
  const userId = place.updatedBy || place.addedBy;
  const action = place.updatedBy ? 'edited' : 'added';
  const timestamp = place.updatedBy ? place.updatedAt : place.addedAt;

  const date = parseTimestamp(timestamp);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const collaborator = list.collaborators.find((c: Collaborator) => c.userId === userId);
  const name = collaborator ? collaborator.username : 'someone';

  let timeString = '';
  if (diffDays <= 1) {
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
    timeString = isToday ? 'today' : 'yesterday';
  } else if (diffDays < 30) timeString = `${diffDays} days ago`;
  else if (diffDays < 365) timeString = `${Math.floor(diffDays / 30)} months ago`;
  else timeString = `${Math.floor(diffDays / 365)} years ago`;

  return `Place ${action} by ${name} · ${timeString}`;
};

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const getTodayDayName = () => DAYS_OF_WEEK[new Date().getDay()];

export const parseOpeningHourLine = (line: string): { day: string; hours: string } => {
  const colonIndex = line.indexOf(': ');
  if (colonIndex === -1) return { day: line, hours: '' };
  return {
    day: line.slice(0, colonIndex),
    hours: line.slice(colonIndex + 2),
  };
};

export const getPlaceMapsUrl = (
  place: Pick<Place, 'googleMapsUrl' | 'googlePlaceId' | 'name' | 'address' | 'location'>
): string | null => {
  if (place.googleMapsUrl) return place.googleMapsUrl;
  if (place.location && place.googlePlaceId) {
    return `https://www.google.com/maps/search/?api=1&query=${place.location.lat},${place.location.lng}&query_place_id=${place.googlePlaceId}`;
  }
  if (place.location) {
    return `https://www.google.com/maps/search/?api=1&query=${place.location.lat},${place.location.lng}`;
  }
  if (place.googlePlaceId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.googlePlaceId}`;
  }
  if (place.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`;
  }
  return null;
};

export const getWebsiteHostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
  }
};

export const getTodayHoursText = (place: Place) => {
  if (!place.openingHours || place.openingHours.length === 0) return null;

  const todayName = place.timeZone
    ? getZonedWeekdayName(place.timeZone)
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
        new Date().getDay()
      ];

  const todayHours = place.openingHours.find((h: string) => h.startsWith(todayName));

  if (!todayHours) return null;

  const parts = todayHours.split(':');
  if (parts.length < 2) return todayHours;

  const text = parts.slice(1).join(':').trim();
  if (text.toLowerCase() === 'closed') {
    return `Closed on ${todayName}`;
  }
  return text;
};

export const getCategoryDisplayText = (place: { category?: string; cuisines?: string[] }) => {
  const parts = [];

  // 1. Add Category first if available
  if (place.category) {
    parts.push(formatCategoryName(place.category));
  }

  // 2. Add cuisines, joined by commas
  if (place.cuisines && place.cuisines.length > 0) {
    const cuisinesText = place.cuisines
      .map((c) => formatCategoryName(c))
      .filter((c) => c.toLowerCase() !== place.category?.toLowerCase()) // Avoid exact duplicate
      .join(', ');

    if (cuisinesText) {
      parts.push(cuisinesText);
    }
  }

  return parts.join(' · ');
};

export const formatPlaceDistance = (
  place: Place,
  userLocation: { lat: number; lng: number } | null
) => {
  if (!userLocation || !place.location) return null;

  return calculateDistance(
    userLocation.lat,
    userLocation.lng,
    place.location.lat,
    place.location.lng
  );
};

export const isPlaceOpen = (place: Place): boolean => {
  // 1. If we have opening hours text for today, rely on it first as it's more descriptive
  // and captures "Closed" explicitly.
  const todayText = getTodayHoursText(place);

  if (todayText) {
    const textLower = todayText.toLowerCase();

    // Explicitly closed
    if (textLower.includes('closed')) {
      return false;
    }

    // Explicitly open 24h
    if (textLower.includes('open 24 hours')) {
      return true;
    }

    if (todayText.match(/\d+:\d+/)) {
      const parsed = isOpenAtTimeFromHoursText(todayText, new Date(), {
        timeZone: place.timeZone,
      });
      if (parsed !== null) {
        return parsed;
      }
      // Hours text exists but could not be parsed — do not trust a stale openNow snapshot.
      return false;
    }
  }

  // 2. Fallback to openNow boolean if available (Google API snapshot)
  // This is a backup because openNow might be stale if the data wasn't just fetched.
  if (place.openNow !== undefined) {
    return place.openNow;
  }

  // 3. If we have no data, we can't determine openness.
  // Returning false is safer than true to avoid disappointment, or undefined to hide the label.
  return false;
};
