import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import { invitationConverter } from '@/features/lists/api/invitationFirestore';
import type { Invitation } from '@/features/lists/types/invitation';
import { changeTopics, emitChange } from '@/lib/localDb/changeBus';
import { acquireSubscription } from '@/lib/localDb/subscriptionRegistry';
import {
  patchCachedInvitation,
  removeCachedInvitation,
  upsertCachedInvitation,
} from '@/lib/localDb/invitationCache';

type InvitationDocChange = {
  type: 'added' | 'modified' | 'removed';
  invitationId: string;
  invitation?: Invitation;
};

async function applyInvitationDocChanges(changes: InvitationDocChange[]): Promise<void> {
  for (const change of changes) {
    if (change.type === 'removed') {
      await removeCachedInvitation(change.invitationId);
      continue;
    }

    const invitation = change.invitation;
    if (!invitation) {
      continue;
    }

    if (invitation.status === 'pending') {
      await upsertCachedInvitation(invitation);
    } else {
      await patchCachedInvitation(change.invitationId, { status: invitation.status });
    }
  }

  if (changes.length > 0) {
    emitChange(changeTopics.invitations());
  }
}

function buildRecipientSyncKey(email?: string | null, username?: string | null): string {
  const normalizedEmail = email?.toLowerCase().trim() ?? '';
  const normalizedUsername = username?.trim() ?? '';
  return `sync:invitations:recipient:${normalizedEmail}:${normalizedUsername}`;
}

export function acquireRecipientInvitationsSync(
  email?: string | null,
  username?: string | null
): () => void {
  const key = buildRecipientSyncKey(email, username);

  return acquireSubscription(key, () => {
    const teardowns: Array<() => void> = [];
    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedUsername = username?.trim();

    if (normalizedEmail) {
      const emailQuery = query(
        collection(db, 'invitations').withConverter(invitationConverter),
        where('invitedEmail', '==', normalizedEmail),
        where('status', '==', 'pending')
      );

      teardowns.push(
        onSnapshot(
          emailQuery,
          (snapshot) => {
            void (async () => {
              try {
                const changes = snapshot.docChanges().map((change) => ({
                  type: change.type,
                  invitationId: change.doc.id,
                  invitation: change.type === 'removed' ? undefined : change.doc.data(),
                }));
                await applyInvitationDocChanges(changes);
              } catch (error) {
                logger.error('Failed to apply invitation snapshot changes (email):', error);
              }
            })();
          },
          (error) => {
            logger.error('Invitation sync subscription error (email):', error);
          }
        )
      );
    }

    if (normalizedUsername) {
      const usernameQuery = query(
        collection(db, 'invitations').withConverter(invitationConverter),
        where('invitedUsername', '==', normalizedUsername),
        where('status', '==', 'pending')
      );

      teardowns.push(
        onSnapshot(
          usernameQuery,
          (snapshot) => {
            void (async () => {
              try {
                const changes = snapshot.docChanges().map((change) => ({
                  type: change.type,
                  invitationId: change.doc.id,
                  invitation: change.type === 'removed' ? undefined : change.doc.data(),
                }));
                await applyInvitationDocChanges(changes);
              } catch (error) {
                logger.error('Failed to apply invitation snapshot changes (username):', error);
              }
            })();
          },
          (error) => {
            logger.error('Invitation sync subscription error (username):', error);
          }
        )
      );
    }

    return () => {
      teardowns.forEach((teardown) => teardown());
    };
  });
}

export function acquireListInvitationsSync(listId: string): () => void {
  return acquireSubscription(`sync:invitations:list:${listId}`, () => {
    const listQuery = query(
      collection(db, 'invitations').withConverter(invitationConverter),
      where('listId', '==', listId),
      where('status', '==', 'pending')
    );

    return onSnapshot(
      listQuery,
      (snapshot) => {
        void (async () => {
          try {
            const changes = snapshot.docChanges().map((change) => ({
              type: change.type,
              invitationId: change.doc.id,
              invitation: change.type === 'removed' ? undefined : change.doc.data(),
            }));
            await applyInvitationDocChanges(changes);
          } catch (error) {
            logger.error('Failed to apply list invitation snapshot changes:', error);
          }
        })();
      },
      (error) => {
        logger.error('List invitation sync subscription error:', error);
      }
    );
  });
}
