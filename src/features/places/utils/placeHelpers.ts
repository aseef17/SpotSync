import type { Place } from '@/features/places/types/place';
import type { PlaceList, Collaborator } from '@/features/lists/types/list';
import { formatCategoryName } from '@/constants/placeCategories';
import { calculateDistance } from '@/utils/geo';

export const formatPrice = (level?: number) => {
  if (!level) return null;
  return '$'.repeat(Math.min(level, 4));
};

export const parseTimestamp = (ts: Date | string | number | { seconds: number } | { __time__: string } | null | undefined): Date => {
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
  }
  else if (diffDays < 30) timeString = `${diffDays} days ago`;
  else if (diffDays < 365) timeString = `${Math.floor(diffDays / 30)} months ago`;
  else timeString = `${Math.floor(diffDays / 365)} years ago`;

  return `Place ${action} by ${name} · ${timeString}`;
};

export const getTodayHoursText = (place: Place) => {
  if (!place.openingHours || place.openingHours.length === 0) return null;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayIndex = new Date().getDay();
  const todayName = days[todayIndex];

  const todayHours = place.openingHours.find((h: string) => h.startsWith(todayName));

  if (!todayHours) return null;

  const parts = todayHours.split(':');
  if (parts.length < 2) return todayHours;

  return parts.slice(1).join(':').trim();
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
      .map(c => formatCategoryName(c))
      .filter(c => c.toLowerCase() !== place.category?.toLowerCase()) // Avoid exact duplicate
      .join(', ');
    
    if (cuisinesText) {
      parts.push(cuisinesText);
    }
  }

  return parts.join(' · ');
};

export const formatPlaceDistance = (place: Place, userLocation: { lat: number; lng: number } | null) => {
  if (!userLocation || !place.location) return null;

  return calculateDistance(
    userLocation.lat,
    userLocation.lng,
    place.location.lat,
    place.location.lng
  );
};
