import type { User } from '@/features/auth/types/user';
import type { Invitation } from '@/features/lists/types/invitation';
import type { PlaceList } from '@/features/lists/types/list';
import type { Place, PlaceStatus } from '@/features/places/types/place';

export type MutationType =
  | 'updatePlaceStatus'
  | 'updatePlace'
  | 'createPlace'
  | 'deletePlace'
  | 'createList'
  | 'updateList'
  | 'deleteList'
  | 'updateUser'
  | 'updateProfile'
  | 'saveListToProfile'
  | 'removeListFromProfile'
  | 'sendInvitation'
  | 'acceptInvitation'
  | 'declineInvitation'
  | 'cancelInvitation'
  | 'removeCollaborator'
  | 'updateCollaboratorRole'
  | 'setNotificationsDisabled';

export interface UpdatePlaceStatusPayload {
  placeId: string;
  status: PlaceStatus;
  userId?: string;
  customValue?: string;
}

export interface UpdatePlacePayload {
  placeId: string;
  updates: Partial<Place> & { updatedAt: Date; updatedBy?: string };
}

export interface CreatePlacePayload {
  placeId: string;
  listId: string;
  place: Omit<Place, 'id'>;
}

export interface DeletePlacePayload {
  placeId: string;
  listId: string;
  userId?: string;
}

export interface CreateListPayload {
  listId: string;
  list: PlaceList;
}

export interface UpdateListPayload {
  listId: string;
  updates: Partial<PlaceList> & { updatedAt: Date; updatedBy?: string };
}

export interface DeleteListPayload {
  listId: string;
}

export interface UpdateUserPayload {
  userId: string;
  updates: Partial<User> & { updatedAt?: Date };
}

export interface UpdateProfilePayload {
  userId: string;
  displayName: string;
  username: string;
  oldUsername?: string;
}

export interface SaveListToProfilePayload {
  userId: string;
  listId: string;
}

export interface RemoveListFromProfilePayload {
  userId: string;
  listId: string;
}

export interface SendInvitationPayload {
  invitationId: string;
  invitation: Omit<Invitation, 'id'>;
}

export interface AcceptInvitationPayload {
  invitationId: string;
}

export interface DeclineInvitationPayload {
  invitationId: string;
}

export interface CancelInvitationPayload {
  invitationId: string;
}

export interface RemoveCollaboratorPayload {
  listId: string;
  collaboratorUserId: string;
  requesterId: string;
  collaborators: PlaceList['collaborators'];
  collaboratorIds: string[];
  editorIds: string[];
}

export interface UpdateCollaboratorRolePayload {
  listId: string;
  collaboratorUserId: string;
  requesterId: string;
  newRole: 'editor' | 'viewer';
  collaborators: PlaceList['collaborators'];
  editorIds: string[];
}

export interface SetNotificationsDisabledPayload {
  userId: string;
  disabled: boolean;
}

export type MutationPayload =
  | UpdatePlaceStatusPayload
  | UpdatePlacePayload
  | CreatePlacePayload
  | DeletePlacePayload
  | CreateListPayload
  | UpdateListPayload
  | DeleteListPayload
  | UpdateUserPayload
  | UpdateProfilePayload
  | SaveListToProfilePayload
  | RemoveListFromProfilePayload
  | SendInvitationPayload
  | AcceptInvitationPayload
  | DeclineInvitationPayload
  | CancelInvitationPayload
  | RemoveCollaboratorPayload
  | UpdateCollaboratorRolePayload
  | SetNotificationsDisabledPayload;

export interface PendingMutation {
  id: string;
  type: MutationType;
  entityId: string;
  payload: MutationPayload;
  createdAt: number;
  updatedAt: number;
}

export function buildMutationKey(type: MutationType, entityId: string): string {
  return `${type}:${entityId}`;
}

export function buildPlaceStatusMutationKey(placeId: string): string {
  return buildMutationKey('updatePlaceStatus', placeId);
}
