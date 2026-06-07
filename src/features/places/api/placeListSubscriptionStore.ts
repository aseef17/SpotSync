import { logger } from '@/utils/logger';
import type { Place } from '@/features/places/types/place';
import { PLACES_SUBSCRIPTION_LIMIT, PlaceService } from '@/features/places/api/placeService';
import type { PlaceListAccessQuery } from '@/features/places/utils/placeAccess';

type PlacesListener = (places: Place[]) => void;
type ErrorListener = (error: Error) => void;

interface ListenerEntry {
  onUpdate: PlacesListener;
  onError: ErrorListener;
}

interface ActivePlacesSubscription {
  key: string;
  unsubscribe: () => void;
  listeners: Set<ListenerEntry>;
}

const activeSubscriptions = new Map<string, ActivePlacesSubscription>();

function buildSubscriptionKey(access: PlaceListAccessQuery, subscriptionLimit: number): string {
  return [
    access.listId,
    access.userId,
    access.ownerId,
    access.isPublic ? 'public' : 'private',
    subscriptionLimit,
  ].join(':');
}

function startSubscription(
  access: PlaceListAccessQuery,
  subscriptionLimit: number
): ActivePlacesSubscription {
  const key = buildSubscriptionKey(access, subscriptionLimit);
  const listeners = new Set<ListenerEntry>();

  const unsubscribe = PlaceService.subscribeToListPlaces(
    access,
    (places) => {
      const subscription = activeSubscriptions.get(key);
      if (!subscription) return;
      subscription.listeners.forEach((listener) => listener.onUpdate(places));
    },
    (error) => {
      const subscription = activeSubscriptions.get(key);
      if (!subscription) return;
      subscription.listeners.forEach((listener) => listener.onError(error));
    },
    subscriptionLimit
  );

  const subscription: ActivePlacesSubscription = { key, unsubscribe, listeners };
  activeSubscriptions.set(key, subscription);
  return subscription;
}

export function subscribeToListPlacesShared(
  access: PlaceListAccessQuery,
  onUpdate: PlacesListener,
  onError: ErrorListener,
  subscriptionLimit: number = PLACES_SUBSCRIPTION_LIMIT
): () => void {
  const key = buildSubscriptionKey(access, subscriptionLimit);
  let subscription = activeSubscriptions.get(key);

  if (!subscription) {
    subscription = startSubscription(access, subscriptionLimit);
  }

  const entry: ListenerEntry = { onUpdate, onError };
  subscription.listeners.add(entry);

  return () => {
    const current = activeSubscriptions.get(key);
    if (!current) return;

    current.listeners.delete(entry);
    if (current.listeners.size === 0) {
      current.unsubscribe();
      activeSubscriptions.delete(key);
    }
  };
}

export function clearPlaceListSubscriptions(): void {
  activeSubscriptions.forEach((subscription) => {
    try {
      subscription.unsubscribe();
    } catch (error) {
      logger.warn('Failed to tear down place list subscription:', error);
    }
  });
  activeSubscriptions.clear();
}
