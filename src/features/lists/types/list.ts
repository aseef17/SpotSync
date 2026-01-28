import type { Place } from '@/features/places/types/place';

export type Permission = 'owner' | 'editor' | 'viewer';

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
  name: string;
  description?: string;
  isPublic: boolean;
  ownerId: string;
  collaborators: Collaborator[];
  collaboratorIds: string[];
  places: Place[];
  customStatuses: string[];
  tags: string[];
  icon?: string;
  color?: string;
  iconSize?: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}
