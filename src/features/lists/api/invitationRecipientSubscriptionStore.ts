import { logger } from '@/utils/logger';
import type { Invitation } from '@/features/lists/types/invitation';
import { invitationRepository } from '@/lib/localDb/repositories/invitationRepository';

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

function buildSubscriptionKey(email?: string | null, username?: string | null): string {
  return `${email?.toLowerCase().trim() ?? ''}:${username?.trim() ?? ''}`;
}

function startSubscription(
  email?: string | null,
  username?: string | null
): ActiveInvitationSubscription {
  const key = buildSubscriptionKey(email, username);
  const listeners = new Set<ListenerEntry>();

  const unsubscribe = invitationRepository.subscribeToRecipientInvitations(
    email,
    username,
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

export function subscribeToRecipientInvitationsShared(
  email: string | null | undefined,
  username: string | null | undefined,
  onUpdate: InvitationsListener,
  onError: ErrorListener
): () => void {
  const key = buildSubscriptionKey(email, username);
  let subscription = activeSubscriptions.get(key);

  if (!subscription) {
    subscription = startSubscription(email, username);
  }

  const entry: ListenerEntry = { onUpdate, onError };
  subscription.listeners.add(entry);

  // Repository publish() runs before listeners are registered on first subscribe.
  // Hydrate this listener immediately from the local cache.
  void invitationRepository
    .getForRecipient(email, username)
    .then((invitations) => {
      logger.warn('[invitations] Initial cache read', { count: invitations.length });
      onUpdate(invitations);
    })
    .catch((error) => {
      onError(error instanceof Error ? error : new Error('Failed to load invitations'));
    });

  return () => {
    const current = activeSubscriptions.get(key);
    if (!current) {
      return;
    }

    current.listeners.delete(entry);
    if (current.listeners.size === 0) {
      current.unsubscribe();
      activeSubscriptions.delete(key);
    }
  };
}

export function clearInvitationRecipientSubscriptions(): void {
  activeSubscriptions.forEach((subscription) => {
    try {
      subscription.unsubscribe();
    } catch (error) {
      logger.warn('Failed to tear down invitation subscription:', error);
    }
  });
  activeSubscriptions.clear();
}
