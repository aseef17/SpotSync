import type { Place } from '@/features/places/types/place';
import { clearPlaceListSubscriptions } from '@/features/places/api/placeListSubscriptionStore';
import { clearAllCachedPlaces } from '@/lib/localDb/placeCache';
import { initLocalDataStore } from '@/lib/localDb/localDataStore';
import { logger } from '@/utils/logger';

/** Bump when place local cache shape or Firestore read model changes. */
export const CURRENT_PLACE_DATA_VERSION = 2;

const PLACE_DATA_VERSION_KEY = 'spotsync-place-data-version';

export function getStoredPlaceDataVersion(): number {
  if (typeof localStorage === 'undefined') {
    return CURRENT_PLACE_DATA_VERSION;
  }

  const raw = localStorage.getItem(PLACE_DATA_VERSION_KEY);
  if (!raw) {
    return 1;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 1;
}

/** Membership doc IDs are `{listId}_{googlePlaceId}`; legacy rows used auto Firestore IDs. */
export function isLegacyCachedPlaceId(place: Pick<Place, 'id' | 'listId'>): boolean {
  const expectedPrefix = `${place.listId}_`;
  return !place.id.startsWith(expectedPrefix);
}

export function needsPlaceDataMigration(): boolean {
  return getStoredPlaceDataVersion() < CURRENT_PLACE_DATA_VERSION;
}

export function markPlaceDataMigrationComplete(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(PLACE_DATA_VERSION_KEY, String(CURRENT_PLACE_DATA_VERSION));
}

/**
 * One-time local purge after the googlePlaces/listPlaces cutover.
 * Lists, profiles, and non-place mutations are preserved.
 */
export async function migratePlaceLocalData(): Promise<void> {
  await initLocalDataStore();
  await clearAllCachedPlaces();
  clearPlaceListSubscriptions();
  markPlaceDataMigrationComplete();
  logger.info('Place local data migration complete');
}
