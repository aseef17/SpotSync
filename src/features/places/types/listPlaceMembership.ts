import type { PlaceStatus } from '@/features/places/types/place';

/**
 * Per-list place membership stored at listPlaces/{listId}_{googlePlaceId}.
 * List-specific fields only — canonical metadata lives on GooglePlace.
 */
export interface ListPlaceMembership {
  /** Composite document ID: `${listId}_${googlePlaceId}`. */
  id: string;
  listId: string;
  googlePlaceId: string;
  status: PlaceStatus;
  customStatus?: string;
  notes?: string;
  addedBy: string;
  addedAt: Date;
  updatedAt: Date;
  updatedBy?: string;
  /** Set during bulk import to suppress per-place Cloud Function notifications. */
  suppressNotifications?: boolean;
}
