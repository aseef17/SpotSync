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

export interface PassportInfoLink {
  label: string;
  url: string;
  category?: string;
}

export interface PassportConfig {
  referenceImageUrl?: string;
  googleMapsListUrl?: string;
  sheetUrl?: string;
  infoLinks?: PassportInfoLink[];
}

export type ListKind = 'nyc_passport';

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
  /** Map marker icon: AUTO or a Lucide icon name. */
  icon?: string;
  /** Map marker color: AUTO or a palette name. */
  color?: string;
  iconSize?: number;
  /** Home-screen list card icon (always a concrete Lucide icon name). */
  cardIcon?: string;
  /** Home-screen list card color (always a concrete palette name). */
  cardColor?: string;
  isSavedList?: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
  /** True while a bulk import is in progress — Cloud Functions skip per-place notifications. */
  importInProgress?: boolean;
  /** Set when importInProgress clears; triggers a single summary notification. */
  lastImportCount?: number;
  /** Special list modes with custom UI (e.g. NYC Neighborhood Passport). */
  listKind?: ListKind;
  passportConfig?: PassportConfig;
}
