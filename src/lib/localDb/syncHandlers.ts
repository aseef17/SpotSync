import { arrayRemove, arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import {
  deletePlaceMembership,
  writePlaceCreateAndLinkToList,
  writePlaceUpdates,
} from '@/features/places/api/placeFirestoreWrite';
import { resolveCanonicalGooglePlaceId } from '@/features/places/utils/placeWriteSplit';
import type { PendingMutation } from '@/lib/localDb/types';
import type {
  AcceptInvitationPayload,
  CancelInvitationPayload,
  CreateListPayload,
  CreatePlacePayload,
  DeclineInvitationPayload,
  DeleteListPayload,
  DeletePlacePayload,
  RemoveCollaboratorPayload,
  RemoveListFromProfilePayload,
  SaveListToProfilePayload,
  SendInvitationPayload,
  SetNotificationsDisabledPayload,
  UpdateCollaboratorRolePayload,
  UpdateListPayload,
  UpdatePlacePayload,
  UpdatePlaceStatusPayload,
  UpdateProfilePayload,
  UpdateUserPayload,
} from '@/lib/localDb/types';
import type { Place } from '@/features/places/types/place';
import { omit } from '@/utils/objectUtils';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

export async function applyPendingMutation(mutation: PendingMutation): Promise<void> {
  switch (mutation.type) {
    case 'updatePlaceStatus':
      await applyUpdatePlaceStatus(mutation.payload as UpdatePlaceStatusPayload);
      return;
    case 'updatePlace':
      await applyUpdatePlace(mutation.payload as UpdatePlacePayload);
      return;
    case 'createPlace':
      await applyCreatePlace(mutation.payload as CreatePlacePayload);
      return;
    case 'deletePlace':
      await applyDeletePlace(mutation.payload as DeletePlacePayload);
      return;
    case 'createList':
      await applyCreateList(mutation.payload as CreateListPayload);
      return;
    case 'updateList':
      await applyUpdateList(mutation.payload as UpdateListPayload);
      return;
    case 'deleteList':
      await applyDeleteList(mutation.payload as DeleteListPayload);
      return;
    case 'updateUser':
      await applyUpdateUser(mutation.payload as UpdateUserPayload);
      return;
    case 'updateProfile':
      await applyUpdateProfile(mutation.payload as UpdateProfilePayload);
      return;
    case 'saveListToProfile':
      await applySaveListToProfile(mutation.payload as SaveListToProfilePayload);
      return;
    case 'removeListFromProfile':
      await applyRemoveListFromProfile(mutation.payload as RemoveListFromProfilePayload);
      return;
    case 'sendInvitation':
      await applySendInvitation(mutation.payload as SendInvitationPayload);
      return;
    case 'acceptInvitation':
      await applyAcceptInvitation(mutation.payload as AcceptInvitationPayload);
      return;
    case 'declineInvitation':
      await applyDeclineInvitation(mutation.payload as DeclineInvitationPayload);
      return;
    case 'cancelInvitation':
      await applyCancelInvitation(mutation.payload as CancelInvitationPayload);
      return;
    case 'removeCollaborator':
      await applyRemoveCollaborator(mutation.payload as RemoveCollaboratorPayload);
      return;
    case 'updateCollaboratorRole':
      await applyUpdateCollaboratorRole(mutation.payload as UpdateCollaboratorRolePayload);
      return;
    case 'setNotificationsDisabled':
      await applySetNotificationsDisabled(mutation.payload as SetNotificationsDisabledPayload);
      return;
    default:
      throw new Error(`Unsupported mutation type: ${String(mutation.type)}`);
  }
}

async function applyUpdatePlaceStatus(payload: UpdatePlaceStatusPayload): Promise<void> {
  const updates: Partial<Place> & { updatedAt: Date; updatedBy?: string } = {
    status: payload.status,
    updatedAt: new Date(),
  };
  if (payload.customValue !== undefined) {
    updates.customStatus = payload.customValue;
  }
  if (payload.userId) {
    updates.updatedBy = payload.userId;
  }
  await writePlaceUpdates(payload.placeId, updates);
}

async function applyUpdatePlace(payload: UpdatePlacePayload): Promise<void> {
  await writePlaceUpdates(payload.placeId, payload.updates);
}

async function applyCreatePlace(payload: CreatePlacePayload): Promise<void> {
  const googlePlaceId = payload.place.googlePlaceId ?? resolveCanonicalGooglePlaceId(payload.place);
  const membershipId = payload.placeId;

  await writePlaceCreateAndLinkToList({
    listId: payload.listId,
    membershipId,
    googlePlaceId,
    place: payload.place,
    timestamps: {
      addedAt: payload.place.addedAt,
      updatedAt: payload.place.updatedAt,
    },
  });
}

async function applyDeletePlace(payload: DeletePlacePayload): Promise<void> {
  await deletePlaceMembership(payload.placeId, payload.listId);
}

async function applyCreateList(payload: CreateListPayload): Promise<void> {
  await setDoc(doc(db, 'lists', payload.listId), omit(payload.list, ['id', 'places']));
}

async function applyUpdateList(payload: UpdateListPayload): Promise<void> {
  await updateDoc(doc(db, 'lists', payload.listId), omit(payload.updates, ['places']));
}

async function applyDeleteList(payload: DeleteListPayload): Promise<void> {
  const deleteListFn = httpsCallable<
    { listId: string },
    { success: boolean; alreadyDeleted?: boolean }
  >(functions, 'deleteList');
  await deleteListFn({ listId: payload.listId });
}

async function applyUpdateUser(payload: UpdateUserPayload): Promise<void> {
  await updateDoc(doc(db, 'users', payload.userId), {
    ...payload.updates,
    updatedAt: payload.updates.updatedAt ?? new Date(),
  });
}

async function applyUpdateProfile(payload: UpdateProfilePayload): Promise<void> {
  const normalizedNewUsername = payload.username.toLowerCase().trim();
  const normalizedOldUsername = payload.oldUsername?.toLowerCase().trim();
  const usernameChanged =
    normalizedOldUsername !== undefined && normalizedNewUsername !== normalizedOldUsername;

  if (!usernameChanged) {
    await updateDoc(doc(db, 'users', payload.userId), {
      displayName: payload.displayName,
      username: normalizedNewUsername,
      updatedAt: new Date(),
    });
    return;
  }

  const { runTransaction } = await import('firebase/firestore');
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', payload.userId);
    const userDoc = await transaction.get(userRef);
    const currentUsername = (userDoc.data() as { username?: string } | undefined)?.username
      ?.toLowerCase()
      .trim();

    const newUsernameRef = doc(db, 'usernames', normalizedNewUsername);
    const newUsernameDoc = await transaction.get(newUsernameRef);
    if (newUsernameDoc.exists()) {
      throw new Error('Username is not available');
    }

    const usernameToRelease = currentUsername || normalizedOldUsername;
    if (usernameToRelease && usernameToRelease !== normalizedNewUsername) {
      transaction.delete(doc(db, 'usernames', usernameToRelease));
    }
    transaction.set(newUsernameRef, { uid: payload.userId });
    transaction.update(userRef, {
      displayName: payload.displayName,
      username: normalizedNewUsername,
      updatedAt: new Date(),
    });
  });
}

async function applySaveListToProfile(payload: SaveListToProfilePayload): Promise<void> {
  await updateDoc(doc(db, 'users', payload.userId), {
    savedLists: arrayUnion(payload.listId),
    updatedAt: new Date(),
  });
}

async function applyRemoveListFromProfile(payload: RemoveListFromProfilePayload): Promise<void> {
  await updateDoc(doc(db, 'users', payload.userId), {
    savedLists: arrayRemove(payload.listId),
    updatedAt: new Date(),
  });
}

async function applySendInvitation(payload: SendInvitationPayload): Promise<void> {
  const invitation = payload.invitation;
  await setDoc(doc(db, 'invitations', payload.invitationId), {
    ...invitation,
    createdAt: Timestamp.fromDate(invitation.createdAt),
    expiresAt: Timestamp.fromDate(invitation.expiresAt),
  });
}

async function applyAcceptInvitation(payload: AcceptInvitationPayload): Promise<void> {
  const acceptInvitationFn = httpsCallable<{ invitationId: string }, { listId: string }>(
    functions,
    'acceptInvitation'
  );
  await acceptInvitationFn({ invitationId: payload.invitationId });
}

async function applyDeclineInvitation(payload: DeclineInvitationPayload): Promise<void> {
  await updateDoc(doc(db, 'invitations', payload.invitationId), { status: 'declined' });
}

async function applyCancelInvitation(payload: CancelInvitationPayload): Promise<void> {
  await updateDoc(doc(db, 'invitations', payload.invitationId), { status: 'cancelled' });
}

async function applyRemoveCollaborator(payload: RemoveCollaboratorPayload): Promise<void> {
  await updateDoc(doc(db, 'lists', payload.listId), {
    collaborators: payload.collaborators,
    collaboratorIds: payload.collaboratorIds,
    editorIds: payload.editorIds,
  });
}

async function applyUpdateCollaboratorRole(payload: UpdateCollaboratorRolePayload): Promise<void> {
  await updateDoc(doc(db, 'lists', payload.listId), {
    collaborators: payload.collaborators,
    editorIds: payload.editorIds,
  });
}

async function applySetNotificationsDisabled(
  payload: SetNotificationsDisabledPayload
): Promise<void> {
  await updateDoc(doc(db, 'users', payload.userId), {
    notificationsDisabled: payload.disabled,
  });
}
