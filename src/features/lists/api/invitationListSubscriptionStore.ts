import { logger } from '@/utils/logger';
import type { Invitation } from '@/features/lists/types/invitation';
import { invitationRepository } from '@/lib/localDb/repositories/invitationRepository';
import {
  cancelAllScheduledTeardowns,
  cancelScheduledTeardown,
  scheduleTeardown,
} from '@/utils/subscriptionTeardownGrace';

type InvitationsListener = (invitations: Invitation[]) => void;
type ErrorListener = (error: Error) => void;

interface ListenerEntry {
  onUpdate: InvitationsListener;
  onError: ErrorListener;
}

interface ActiveInvitationSubscription {
  key: string;
  unsubscribe: () => void;
  listeners: Set<ListenerEntry>;
}

const activeSubscriptions = new Map<string, ActiveInvitationSubscription>();

function startSubscription(listId: string): ActiveInvitationSubscription {
  const key = listId;
  const listeners = new Set<ListenerEntry>();

  const unsubscribe = invitationRepository.subscribeToListInvitations(
    listId,
    (invitations) => {
      const subscription = activeSubscriptions.get(key);
      if (!subscription) {
        return;
      }
      subscription.listeners.forEach((listener) => listener.onUpdate(invitations));
    },
    (error) => {
      const subscription = activeSubscriptions.get(key);
      if (!subscription) {
        return;
      }
      subscription.listeners.forEach((listener) => listener.onError(error));
    }
  );

  const subscription: ActiveInvitationSubscription = { key, unsubscribe, listeners };
  activeSubscriptions.set(key, subscription);
  return subscription;
}

export function subscribeToListInvitationsShared(
  listId: string,
  onUpdate: InvitationsListener,
  onError: ErrorListener
): () => void {
  cancelScheduledTeardown(listId);
  let subscription = activeSubscriptions.get(listId);

  if (!subscription) {
    subscription = startSubscription(listId);
  }

  const entry: ListenerEntry = { onUpdate, onError };
  subscription.listeners.add(entry);

  return () => {
    const current = activeSubscriptions.get(listId);
    if (!current) {
      return;
    }

    current.listeners.delete(entry);
    if (current.listeners.size === 0) {
      scheduleTeardown(
        listId,
        () => {
          const active = activeSubscriptions.get(listId);
          if (active && active.listeners.size === 0) {
            active.unsubscribe();
            activeSubscriptions.delete(listId);
          }
        },
        () => {
          const active = activeSubscriptions.get(listId);
          return !active || active.listeners.size === 0;
        }
      );
    }
  };
}

export function clearInvitationListSubscriptions(): void {
  cancelAllScheduledTeardowns();
  activeSubscriptions.forEach((subscription) => {
    try {
      subscription.unsubscribe();
    } catch (error) {
      logger.warn('Failed to tear down list invitation subscription:', error);
    }
  });
  activeSubscriptions.clear();
}
