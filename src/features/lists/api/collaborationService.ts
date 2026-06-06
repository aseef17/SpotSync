import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invitation } from '@/features/lists/types/invitation';
import type { Collaborator } from '@/features/lists/types/list';
import { listConverter } from '@/features/lists/api/listService';
import { logger } from '@/utils/logger';

export class CollaborationService {
  static async getMyInvitations(
    email: string | null | undefined,
    username?: string | null
  ): Promise<Invitation[]> {
    if (!email && !username) return [];

    try {
      const queries = [];

      if (email) {
        queries.push(
          getDocs(
            query(
              collection(db, 'invitations'),
              where('invitedEmail', '==', email),
              where('status', '==', 'pending')
            )
          )
        );
      }

      if (username) {
        queries.push(
          getDocs(
            query(
              collection(db, 'invitations'),
              where('invitedUsername', '==', username),
              where('status', '==', 'pending')
            )
          )
        );
      }

      const snapshots = await Promise.all(queries);
      const invitations: Invitation[] = [];
      const seenIds = new Set();

      snapshots.forEach((snap) => {
        snap.forEach((doc) => {
          if (!seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            const data = doc.data();
            invitations.push({
              id: doc.id,
              ...data,
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt.toDate()
                  : new Date(data.createdAt),
              expiresAt:
                data.expiresAt instanceof Timestamp
                  ? data.expiresAt.toDate()
                  : new Date(data.expiresAt),
            } as Invitation);
          }
        });
      });

      return invitations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      logger.error('Error fetching invitations:', error);
      throw error;
    }
  }

  static async getPendingInvitationsForList(listId: string): Promise<Invitation[]> {
    try {
      const snapshot = await getDocs(
        query(
          collection(db, 'invitations'),
          where('listId', '==', listId),
          where('status', '==', 'pending')
        )
      );
      const invitations: Invitation[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : new Date(data.createdAt),
          expiresAt:
            data.expiresAt instanceof Timestamp
              ? data.expiresAt.toDate()
              : new Date(data.expiresAt),
        } as Invitation;
      });

      return invitations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      logger.error('Error fetching pending invitations for list:', error);
      throw error;
    }
  }

  // Send an invitation to collaborate on a list
  static async sendInvitation(
    listId: string,
    inviteeIdentifier: string, // email or username
    role: 'editor' | 'viewer',
    inviterId: string,
    inviterUsername: string
  ): Promise<string> {
    try {
      // Get the list to include the name in the invitation
      const listRef = doc(db, 'lists', listId).withConverter(listConverter);
      const listDoc = await getDoc(listRef);

      if (!listDoc.exists()) {
        throw new Error('List not found');
      }

      const list = listDoc.data();

      // Check if inviter has permission to invite (must be owner or editor)
      const inviterCollab = list.collaborators.find((c) => c.userId === inviterId);
      if (!inviterCollab || inviterCollab.permission === 'viewer') {
        throw new Error('You do not have permission to invite collaborators');
      }

      // Determine if this is an email invite and normalize to lowercase
      const isEmailInvite = inviteeIdentifier.includes('@');
      const normalizedIdentifier = isEmailInvite
        ? inviteeIdentifier.toLowerCase().trim()
        : inviteeIdentifier.trim();

      // Check if user is already a collaborator
      const existingCollab = list.collaborators.find((c) =>
        isEmailInvite
          ? c.email?.toLowerCase() === normalizedIdentifier
          : c.username === normalizedIdentifier
      );

      if (existingCollab) {
        throw new Error('This user is already a collaborator');
      }

      // Check for existing pending invitation
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

      // Create invitation with 7-day expiration
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

      const invitationRef = await addDoc(collection(db, 'invitations'), {
        ...invitation,
        createdAt: Timestamp.fromDate(now),
        expiresAt: Timestamp.fromDate(expiresAt),
      });

      return invitationRef.id;
    } catch (error) {
      logger.error('Error sending invitation:', error);
      throw error;
    }
  }

  // Accept an invitation
  static async acceptInvitation(
    invitationId: string,
    userId: string,
    username: string,
    email: string
  ): Promise<void> {
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      const invitationDoc = await getDoc(invitationRef);

      if (!invitationDoc.exists()) {
        throw new Error('Invitation not found');
      }

      const invitation = invitationDoc.data() as Invitation;

      // Verify invitation belongs to this user
      if (invitation.invitedEmail !== email && invitation.invitedUsername !== username) {
        throw new Error('This invitation is not for you');
      }

      // Check if expired
      const now = new Date();
      const expiresAt =
        invitation.expiresAt instanceof Timestamp
          ? invitation.expiresAt.toDate()
          : invitation.expiresAt;

      if (expiresAt < now) {
        await updateDoc(invitationRef, {
          status: 'expired',
        });
        throw new Error('Invitation has expired');
      }

      // Check if already accepted/declined
      if (invitation.status !== 'pending') {
        throw new Error('Invitation has already been responded to');
      }

      // Add user as collaborator to the list
      const listRef = doc(db, 'lists', invitation.listId).withConverter(listConverter);
      const listDoc = await getDoc(listRef);

      if (!listDoc.exists()) {
        throw new Error('List not found');
      }

      const list = listDoc.data();

      const newCollaborator: Collaborator = {
        userId,
        username,
        email,
        permission: invitation.role,
        invitedAt: invitation.createdAt,
        joinedAt: now,
      };

      // Map existing collaborators to IDs and add the new one
      // Also ensure we capture any existing ids for robustness
      const allCollaboratorIds = Array.from(
        new Set([...list.collaborators.map((c) => c.userId), list.ownerId, userId])
      );

      // Update list with new collaborator and synced IDs
      await updateDoc(listRef, {
        collaborators: [...list.collaborators, newCollaborator],
        collaboratorIds: allCollaboratorIds,
      });

      // Mark invitation as accepted
      await updateDoc(invitationRef, {
        status: 'accepted',
      });
    } catch (error) {
      logger.error('Error accepting invitation:', error);
      throw error;
    }
  }

  // Decline an invitation
  static async declineInvitation(invitationId: string): Promise<void> {
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      const invitationDoc = await getDoc(invitationRef);

      if (!invitationDoc.exists()) {
        throw new Error('Invitation not found');
      }

      const invitation = invitationDoc.data() as Invitation;

      // Check if already accepted/declined
      if (invitation.status !== 'pending') {
        throw new Error('Invitation has already been responded to');
      }

      // Mark invitation as declined
      await updateDoc(invitationRef, {
        status: 'declined',
      });
    } catch (error) {
      logger.error('Error declining invitation:', error);
      throw error;
    }
  }

  // Cancel an invitation (by sender)
  static async cancelInvitation(invitationId: string): Promise<void> {
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      const invitationDoc = await getDoc(invitationRef);

      if (!invitationDoc.exists()) {
        throw new Error('Invitation not found');
      }

      const invitation = invitationDoc.data() as Invitation;

      // Check if already accepted/declined/cancelled
      if (invitation.status !== 'pending') {
        throw new Error('Invitation has already been responded to');
      }

      // Mark invitation as cancelled
      await updateDoc(invitationRef, {
        status: 'cancelled',
      });
    } catch (error) {
      logger.error('Error cancelling invitation:', error);
      throw error;
    }
  }

  // Get pending invitations for a user
  static async getPendingInvitations(userId: string): Promise<Invitation[]> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return [];

      const userData = userDoc.data();
      const email = userData.email;
      const username = userData.username;

      if (!email && !username) return [];

      const queries = [];

      // Query by email if available
      if (email) {
        queries.push(
          query(
            collection(db, 'invitations'),
            where('invitedEmail', '==', email),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
          )
        );
      }

      // Query by username if available
      if (username) {
        queries.push(
          query(
            collection(db, 'invitations'),
            where('invitedUsername', '==', username),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
          )
        );
      }

      const querySnapshots = await Promise.all(queries.map((q) => getDocs(q)));

      const invitations = new Map<string, Invitation>();

      // Combine results and remove duplicates
      querySnapshots.forEach((snapshot) => {
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          invitations.set(doc.id, {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
            expiresAt: data.expiresAt?.toDate?.() || new Date(data.expiresAt),
          } as Invitation);
        });
      });

      return Array.from(invitations.values());
    } catch (error) {
      logger.error('Error getting invitations:', error);
      throw error;
    }
  }

  // Remove a collaborator from a list
  static async removeCollaborator(
    listId: string,
    collaboratorUserId: string,
    requesterId: string
  ): Promise<void> {
    try {
      const listRef = doc(db, 'lists', listId).withConverter(listConverter);
      const listDoc = await getDoc(listRef);

      if (!listDoc.exists()) {
        throw new Error('List not found');
      }

      const list = listDoc.data();

      // Check if requester has permission (must be owner)
      const requesterCollab = list.collaborators.find((c) => c.userId === requesterId);
      if (!requesterCollab || requesterCollab.permission !== 'owner') {
        throw new Error('Only the owner can remove collaborators');
      }

      // Remove the collaborator
      const updatedCollaborators = list.collaborators.filter(
        (c) => c.userId !== collaboratorUserId
      );

      await updateDoc(listRef, {
        collaborators: updatedCollaborators,
      });
    } catch (error) {
      logger.error('Error removing collaborator:', error);
      throw error;
    }
  }

  // Update a collaborator's role
  static async updateCollaboratorRole(
    listId: string,
    collaboratorUserId: string,
    newRole: 'editor' | 'viewer',
    requesterId: string
  ): Promise<void> {
    try {
      const listRef = doc(db, 'lists', listId).withConverter(listConverter);
      const listDoc = await getDoc(listRef);

      if (!listDoc.exists()) {
        throw new Error('List not found');
      }

      const list = listDoc.data();

      // Check if requester has permission (must be owner)
      const requesterCollab = list.collaborators.find((c) => c.userId === requesterId);
      if (!requesterCollab || requesterCollab.permission !== 'owner') {
        throw new Error('Only the owner can change collaborator roles');
      }

      // Can't change owner's role
      const collaboratorToUpdate = list.collaborators.find((c) => c.userId === collaboratorUserId);
      if (collaboratorToUpdate?.permission === 'owner') {
        throw new Error("Cannot change the owner's role");
      }

      // Update collaborator's role
      const updatedCollaborators = list.collaborators.map((c) =>
        c.userId === collaboratorUserId ? { ...c, permission: newRole } : c
      );

      await updateDoc(listRef, {
        collaborators: updatedCollaborators,
      });
    } catch (error) {
      logger.error('Error updating collaborator role:', error);
      throw error;
    }
  }
}
