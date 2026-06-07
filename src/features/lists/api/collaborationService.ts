import { collection, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  patchCachedInvitation,
  queueOfflineMutation,
  upsertCachedInvitation,
  upsertCachedList,
} from '@/lib/localDb';
import { invitationRepository } from '@/lib/localDb/repositories/invitationRepository';
import { listRepository } from '@/lib/localDb/repositories/listRepository';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import type { Invitation } from '@/features/lists/types/invitation';
import { logger } from '@/utils/logger';

export class CollaborationService {
  static async getMyInvitations(
    email: string | null | undefined,
    username?: string | null
  ): Promise<Invitation[]> {
    return invitationRepository.getForRecipient(email, username);
  }

  static async getPendingInvitationsForList(listId: string): Promise<Invitation[]> {
    return invitationRepository.getPendingForList(listId);
  }

  static async sendInvitation(
    listId: string,
    inviteeIdentifier: string,
    role: 'editor' | 'viewer',
    inviterId: string,
    inviterUsername: string
  ): Promise<string> {
    try {
      const list = await listRepository.getById(listId);
      if (!list) {
        throw new Error('List not found');
      }

      const inviterCollab = list.collaborators.find((c) => c.userId === inviterId);
      if (!inviterCollab || inviterCollab.permission === 'viewer') {
        throw new Error('You do not have permission to invite collaborators');
      }

      const isEmailInvite = inviteeIdentifier.includes('@');
      const normalizedIdentifier = isEmailInvite
        ? inviteeIdentifier.toLowerCase().trim()
        : inviteeIdentifier.trim();

      const existingCollab = list.collaborators.find((c) =>
        isEmailInvite
          ? c.email?.toLowerCase() === normalizedIdentifier
          : c.username === normalizedIdentifier
      );

      if (existingCollab) {
        throw new Error('This user is already a collaborator');
      }

      const pendingInvitations = await invitationRepository.getPendingForList(listId);
      const alreadyPending = pendingInvitations.some((inv) =>
        isEmailInvite
          ? inv.invitedEmail?.toLowerCase() === normalizedIdentifier
          : inv.invitedUsername === normalizedIdentifier
      );

      if (alreadyPending) {
        throw new Error('An invitation is already pending for this user');
      }

      if (isBrowserOnline()) {
        const existingInviteQuery = query(
          collection(db, 'invitations'),
          where('listId', '==', listId),
          where(isEmailInvite ? 'invitedEmail' : 'invitedUsername', '==', normalizedIdentifier),
          where('status', '==', 'pending')
        );
        const existingInvites = await getDocs(existingInviteQuery);
        if (!existingInvites.empty) {
          throw new Error('An invitation is already pending for this user');
        }
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const invitation: Omit<Invitation, 'id'> = {
        listId,
        listName: list.name,
        invitedBy: inviterId,
        invitedByUsername: inviterUsername,
        ...(isEmailInvite
          ? { invitedEmail: normalizedIdentifier }
          : { invitedUsername: normalizedIdentifier }),
        role,
        status: 'pending',
        createdAt: now,
        expiresAt,
      };

      const invitationRef = doc(collection(db, 'invitations'));
      const invitationId = invitationRef.id;
      const invitationWithId: Invitation = { ...invitation, id: invitationId };

      await queueOfflineMutation(
        'sendInvitation',
        invitationId,
        { invitationId, invitation },
        async () => {
          await upsertCachedInvitation(invitationWithId);
        }
      );

      return invitationId;
    } catch (error) {
      logger.error('Error sending invitation:', error);
      throw error;
    }
  }

  static async acceptInvitation(invitationId: string): Promise<void> {
    try {
      await queueOfflineMutation(
        'acceptInvitation',
        invitationId,
        { invitationId },
        async () => {
          await patchCachedInvitation(invitationId, { status: 'accepted' });
        }
      );
    } catch (error) {
      logger.error('Error accepting invitation:', error);
      throw error;
    }
  }

  static async declineInvitation(invitationId: string): Promise<void> {
    try {
      await queueOfflineMutation(
        'declineInvitation',
        invitationId,
        { invitationId },
        async () => {
          await patchCachedInvitation(invitationId, { status: 'declined' });
        }
      );
    } catch (error) {
      logger.error('Error declining invitation:', error);
      throw error;
    }
  }

  static async cancelInvitation(invitationId: string): Promise<void> {
    try {
      await queueOfflineMutation(
        'cancelInvitation',
        invitationId,
        { invitationId },
        async () => {
          await patchCachedInvitation(invitationId, { status: 'cancelled' });
        }
      );
    } catch (error) {
      logger.error('Error cancelling invitation:', error);
      throw error;
    }
  }

  static async getPendingInvitations(
    email: string | null | undefined,
    username?: string | null
  ): Promise<Invitation[]> {
    return invitationRepository.getForRecipient(email, username);
  }

  static async removeCollaborator(
    listId: string,
    collaboratorUserId: string,
    requesterId: string
  ): Promise<void> {
    try {
      const list = await listRepository.getById(listId);
      if (!list) {
        throw new Error('List not found');
      }

      const requesterCollab = list.collaborators.find((c) => c.userId === requesterId);
      if (!requesterCollab || requesterCollab.permission !== 'owner') {
        throw new Error('Only the owner can remove collaborators');
      }

      const updatedCollaborators = list.collaborators.filter(
        (c) => c.userId !== collaboratorUserId
      );
      const collaboratorIds = list.collaboratorIds.filter((id) => id !== collaboratorUserId);
      const editorIds = (list.editorIds ?? []).filter((id) => id !== collaboratorUserId);

      await queueOfflineMutation(
        'removeCollaborator',
        `${listId}:${collaboratorUserId}`,
        {
          listId,
          collaboratorUserId,
          requesterId,
          collaborators: updatedCollaborators,
          collaboratorIds,
          editorIds,
        },
        async () => {
          const listSnapshot = list;
          await upsertCachedList({
            ...listSnapshot,
            collaborators: updatedCollaborators,
            collaboratorIds,
            editorIds,
            updatedAt: new Date(),
          });
        }
      );
    } catch (error) {
      logger.error('Error removing collaborator:', error);
      throw error;
    }
  }

  static async updateCollaboratorRole(
    listId: string,
    collaboratorUserId: string,
    newRole: 'editor' | 'viewer',
    requesterId: string
  ): Promise<void> {
    try {
      const list = await listRepository.getById(listId);
      if (!list) {
        throw new Error('List not found');
      }

      const requesterCollab = list.collaborators.find((c) => c.userId === requesterId);
      if (!requesterCollab || requesterCollab.permission !== 'owner') {
        throw new Error('Only the owner can change collaborator roles');
      }

      const collaboratorToUpdate = list.collaborators.find((c) => c.userId === collaboratorUserId);
      if (collaboratorToUpdate?.permission === 'owner') {
        throw new Error("Cannot change the owner's role");
      }

      const updatedCollaborators = list.collaborators.map((c) =>
        c.userId === collaboratorUserId ? { ...c, permission: newRole } : c
      );

      const editorIds = Array.from(
        new Set(
          updatedCollaborators
            .filter((c) => c.permission === 'owner' || c.permission === 'editor')
            .map((c) => c.userId)
        )
      );

      await queueOfflineMutation(
        'updateCollaboratorRole',
        `${listId}:${collaboratorUserId}`,
        {
          listId,
          collaboratorUserId,
          requesterId,
          newRole,
          collaborators: updatedCollaborators,
          editorIds,
        },
        async () => {
          const listSnapshot = list;
          await upsertCachedList({
            ...listSnapshot,
            collaborators: updatedCollaborators,
            editorIds,
            updatedAt: new Date(),
          });
        }
      );
    } catch (error) {
      logger.error('Error updating collaborator role:', error);
      throw error;
    }
  }
}
