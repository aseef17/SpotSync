import type { User } from '@/features/auth/types/user';
import type { Invitation } from '@/features/lists/types/invitation';
import type { PlaceList } from '@/features/lists/types/list';
import type { Place } from '@/features/places/types/place';
import type {
  CreateListPayload,
  CreatePlacePayload,
  PendingMutation,
  RemoveCollaboratorPayload,
  UpdateCollaboratorRolePayload,
  UpdateListPayload,
  UpdatePlacePayload,
  UpdatePlaceStatusPayload,
  UpdateProfilePayload,
  UpdateUserPayload,
} from '@/lib/localDb/types';

export function applyStatusMutationToPlace(place: Place, payload: UpdatePlaceStatusPayload): Place {
  if (place.id !== payload.placeId) {
    return place;
  }

  const updated: Place = {
    ...place,
    status: payload.status,
    updatedAt: new Date(),
  };

  if (payload.customValue !== undefined) {
    updated.customStatus = payload.customValue;
  } else if (payload.status !== 'custom') {
    updated.customStatus = undefined;
  }

  if (payload.userId) {
    updated.updatedBy = payload.userId;
  }

  return updated;
}

export function applyPendingMutationsToPlaces(
  places: Place[],
  mutations: PendingMutation[]
): Place[] {
  if (mutations.length === 0) {
    return places;
  }

  const deletedIds = new Set<string>();
  const statusMutations = new Map<string, UpdatePlaceStatusPayload>();
  const updateMutations = new Map<string, UpdatePlacePayload['updates']>();
  const createdPlaces = new Map<string, Place>();

  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'deletePlace':
        deletedIds.add(mutation.entityId);
        break;
      case 'updatePlaceStatus':
        statusMutations.set(mutation.entityId, mutation.payload as UpdatePlaceStatusPayload);
        break;
      case 'updatePlace': {
        const payload = mutation.payload as UpdatePlacePayload;
        const existing = updateMutations.get(payload.placeId) ?? {};
        updateMutations.set(payload.placeId, { ...existing, ...payload.updates });
        break;
      }
      case 'createPlace': {
        const payload = mutation.payload as CreatePlacePayload;
        createdPlaces.set(payload.placeId, { ...payload.place, id: payload.placeId });
        break;
      }
      default:
        break;
    }
  }

  let result = places.filter((place) => !deletedIds.has(place.id));

  for (const [placeId, place] of createdPlaces) {
    if (!deletedIds.has(placeId) && !result.some((entry) => entry.id === placeId)) {
      result = [place, ...result];
    }
  }

  return result.map((place) => {
    let updated = place;
    const statusPayload = statusMutations.get(place.id);
    if (statusPayload) {
      updated = applyStatusMutationToPlace(updated, statusPayload);
    }
    const updates = updateMutations.get(place.id);
    if (updates) {
      updated = { ...updated, ...updates };
    }
    return updated;
  });
}

export function applyPendingMutationsToPlace(place: Place, mutations: PendingMutation[]): Place {
  return applyPendingMutationsToPlaces([place], mutations)[0] ?? place;
}

export function applyPendingMutationsToLists(
  lists: PlaceList[],
  mutations: PendingMutation[]
): PlaceList[] {
  if (mutations.length === 0) {
    return lists;
  }

  const deletedIds = new Set<string>();
  const updateMutations = new Map<string, UpdateListPayload['updates']>();
  const createdLists = new Map<string, PlaceList>();
  const collaboratorMutations = new Map<string, PlaceList>();

  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'deleteList':
        deletedIds.add(mutation.entityId);
        break;
      case 'updateList': {
        const payload = mutation.payload as UpdateListPayload;
        const existing = updateMutations.get(payload.listId) ?? {};
        updateMutations.set(payload.listId, { ...existing, ...payload.updates });
        break;
      }
      case 'createList': {
        const payload = mutation.payload as CreateListPayload;
        createdLists.set(payload.listId, payload.list);
        break;
      }
      case 'removeCollaborator': {
        const payload = mutation.payload as RemoveCollaboratorPayload;
        collaboratorMutations.set(payload.listId, {
          ...(collaboratorMutations.get(payload.listId) ?? ({} as PlaceList)),
          id: payload.listId,
          collaborators: payload.collaborators,
          collaboratorIds: payload.collaboratorIds,
          editorIds: payload.editorIds,
        } as PlaceList);
        break;
      }
      case 'updateCollaboratorRole': {
        const payload = mutation.payload as UpdateCollaboratorRolePayload;
        collaboratorMutations.set(payload.listId, {
          ...(collaboratorMutations.get(payload.listId) ?? ({} as PlaceList)),
          id: payload.listId,
          collaborators: payload.collaborators,
          editorIds: payload.editorIds,
        } as PlaceList);
        break;
      }
      default:
        break;
    }
  }

  let result = lists.filter((list) => !deletedIds.has(list.id));

  for (const [listId, list] of createdLists) {
    if (!deletedIds.has(listId) && !result.some((entry) => entry.id === listId)) {
      result = [list, ...result];
    }
  }

  return result.map((list) => {
    let updated = list;
    const updates = updateMutations.get(list.id);
    if (updates) {
      updated = { ...updated, ...updates };
    }
    const collaboratorPatch = collaboratorMutations.get(list.id);
    if (collaboratorPatch) {
      updated = { ...updated, ...collaboratorPatch };
    }
    return updated;
  });
}

export function applyPendingMutationsToInvitations(
  invitations: Invitation[],
  mutations: PendingMutation[]
): Invitation[] {
  if (mutations.length === 0) {
    return invitations;
  }

  const statusById = new Map<string, Invitation['status']>();
  const created = new Map<string, Invitation>();

  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'sendInvitation': {
        const payload = mutation.payload as {
          invitationId: string;
          invitation: Omit<Invitation, 'id'>;
        };
        created.set(payload.invitationId, { ...payload.invitation, id: payload.invitationId });
        break;
      }
      case 'declineInvitation':
        statusById.set(mutation.entityId, 'declined');
        break;
      case 'cancelInvitation':
        statusById.set(mutation.entityId, 'cancelled');
        break;
      case 'acceptInvitation':
        statusById.set(mutation.entityId, 'accepted');
        break;
      default:
        break;
    }
  }

  let result = [...invitations];
  for (const [id, invitation] of created) {
    if (!result.some((entry) => entry.id === id)) {
      result = [invitation, ...result];
    }
  }

  return result
    .map((invitation) => {
      const status = statusById.get(invitation.id);
      return status ? { ...invitation, status } : invitation;
    })
    .filter((invitation) => invitation.status === 'pending');
}

export function applyPendingMutationsToUser(user: User, mutations: PendingMutation[]): User {
  let updated = user;

  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'updateUser': {
        const payload = mutation.payload as UpdateUserPayload;
        if (payload.userId === user.id) {
          updated = { ...updated, ...payload.updates, updatedAt: new Date() };
        }
        break;
      }
      case 'updateProfile': {
        const payload = mutation.payload as UpdateProfilePayload;
        if (payload.userId === user.id) {
          updated = {
            ...updated,
            displayName: payload.displayName,
            username: payload.username,
            updatedAt: new Date(),
          };
        }
        break;
      }
      case 'saveListToProfile': {
        const payload = mutation.payload as { userId: string; listId: string };
        const savedLists = updated.savedLists ?? [];
        if (payload.userId === user.id && !savedLists.includes(payload.listId)) {
          updated = {
            ...updated,
            savedLists: [...savedLists, payload.listId],
            updatedAt: new Date(),
          };
        }
        break;
      }
      case 'removeListFromProfile': {
        const payload = mutation.payload as { userId: string; listId: string };
        if (payload.userId === user.id) {
          const savedLists = updated.savedLists ?? [];
          updated = {
            ...updated,
            savedLists: savedLists.filter((id) => id !== payload.listId),
            updatedAt: new Date(),
          };
        }
        break;
      }
      case 'setNotificationsDisabled': {
        const payload = mutation.payload as { userId: string; disabled: boolean };
        if (payload.userId === user.id) {
          updated = {
            ...updated,
            notificationsDisabled: payload.disabled,
            updatedAt: new Date(),
          };
        }
        break;
      }
      default:
        break;
    }
  }

  return updated;
}
