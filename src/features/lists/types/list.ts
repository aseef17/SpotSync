import type { Place } from '@/features/places/types/place';

export type Permission = 'owner' | 'editor' | 'viewer';

export const LIST_NAME_MAX_LENGTH = 100;
export const LIST_DESCRIPTION_MAX_LENGTH = 500;

export interface Collaborator {
  userId: string;
  username: string;
  email: string;
  permission: Permission;
  invitedAt: Date;
  joinedAt?: Date;
}

export interface PlaceList {
  id: string;
  clientId?: string; // Stable ID for UI key tracking to prevent remounts during optimistic updates
  name: string;
  description?: string;
  isPublic: boolean;
  ownerId: string;
  collaborators: Collaborator[];
  collaboratorIds: string[];
  editorIds?: string[];
  places: Place[];
  /** Canonical googlePlaceIds stored on lists/{listId} in Firestore. */
  placeIds?: string[];
  customStatuses: string[];
  tags: string[];
  icon?: string;
  color?: string;
  iconSize?: number;
  isSavedList?: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
  /** True while a bulk import is in progress — Cloud Functions skip per-place notifications. */
  importInProgress?: boolean;
  /** Set when importInProgress clears; triggers a single summary notification. */
  lastImportCount?: number;
}
