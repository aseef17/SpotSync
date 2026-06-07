import { logger } from '@/utils/logger';
import type { Invitation } from '@/features/lists/types/invitation';
import {
  applyPendingMutationsToInvitations,
  getCachedInvitations,
  getPendingMutations,
} from '@/lib/localDb';
import { changeTopics, subscribeToChanges } from '@/lib/localDb/changeBus';
import {
  acquireListInvitationsSync,
  acquireRecipientInvitationsSync,
} from '@/lib/localDb/sync/invitationSync';

function matchesRecipient(
  invitation: Invitation,
  email?: string | null,
  username?: string | null
): boolean {
  const normalizedEmail = email?.toLowerCase().trim();
  const normalizedUsername = username?.trim();

  if (normalizedEmail && invitation.invitedEmail?.toLowerCase() === normalizedEmail) {
    return true;
  }

  if (normalizedUsername && invitation.invitedUsername === normalizedUsername) {
    return true;
  }

  return false;
}

async function readInvitations(
  predicate: (invitation: Invitation) => boolean
): Promise<Invitation[]> {
  const cached = await getCachedInvitations();
  const pending = cached.filter((invitation) => invitation.status === 'pending' && predicate(invitation));
  const pendingMutations = await getPendingMutations();
  const withOverlay = applyPendingMutationsToInvitations(pending, pendingMutations);
  return withOverlay
    .filter((invitation) => invitation.status === 'pending' && predicate(invitation))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export const invitationRepository = {
  async getForRecipient(
    email?: string | null,
    username?: string | null
  ): Promise<Invitation[]> {
    if (!email && !username) {
      return [];
    }

    return readInvitations((invitation) => matchesRecipient(invitation, email, username));
  },

  async getPendingForList(listId: string): Promise<Invitation[]> {
    return readInvitations((invitation) => invitation.listId === listId);
  },

  subscribeToRecipientInvitations(
    email: string | null | undefined,
    username: string | null | undefined,
    onUpdate: (invitations: Invitation[]) => void,
    onError: (error: Error) => void
  ): () => void {
    let cancelled = false;

    const publish = async () => {
      if (cancelled) {
        return;
      }

      try {
        const invitations = await readInvitations((invitation) =>
          matchesRecipient(invitation, email, username)
        );
        logger.warn('[invitations] Repository publish', { count: invitations.length });
        onUpdate(invitations);
      } catch (error) {
        logger.error('[invitations] Repository publish failed:', error);
        onError(
          error instanceof Error ? error : new Error('Failed to read invitations from local store')
        );
      }
    };

    void publish();

    const releaseSync = acquireRecipientInvitationsSync(email, username);
    const unsubscribeChanges = subscribeToChanges(changeTopics.invitations(), () => {
      void publish();
    });

    return () => {
      cancelled = true;
      releaseSync();
      unsubscribeChanges();
    };
  },

  subscribeToListInvitations(
    listId: string,
    onUpdate: (invitations: Invitation[]) => void,
    onError: (error: Error) => void
  ): () => void {
    let cancelled = false;

    const publish = async () => {
      if (cancelled) {
        return;
      }

      try {
        const invitations = await readInvitations((invitation) => invitation.listId === listId);
        onUpdate(invitations);
      } catch (error) {
        onError(
          error instanceof Error ? error : new Error('Failed to read invitations from local store')
        );
      }
    };

    void publish();

    const releaseSync = acquireListInvitationsSync(listId);
    const unsubscribeChanges = subscribeToChanges(changeTopics.invitations(), () => {
      void publish();
    });

    return () => {
      cancelled = true;
      releaseSync();
      unsubscribeChanges();
    };
  },
};
