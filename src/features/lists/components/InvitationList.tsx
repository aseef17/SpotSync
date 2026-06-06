import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@/utils/logger';
import { Mail, Check, X, Clock } from 'lucide-react';
import { CollaborationService } from '@/features/lists/api/collaborationService';
import { useAuth } from '@/features/auth/context/AuthContext';
import { themeColors } from '@/styles/colors';
import type { Invitation } from '@/features/lists/types/invitation';

import { useToast } from '@/hooks/useToast';

interface InvitationListProps {
  onInvitationAccepted?: () => void;
}

export const InvitationList: React.FunctionComponent<InvitationListProps> = ({
  onInvitationAccepted,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const loadInvitations = useCallback(async () => {
    if (!user?.email || !user?.username) return;

    try {
      setLoading(true);
      const invites = await CollaborationService.getMyInvitations(user.email, user.username);
      setInvitations(invites);
    } catch (err) {
      logger.error('Error loading invitations:', err);
      toast.error('Failed to load invitations');
    } finally {
      setLoading(false);
    }
  }, [user?.email, user?.username, toast]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleAccept = async (invitation: Invitation) => {
    if (!user) return;

    setActionLoading(invitation.id);

    try {
      await CollaborationService.acceptInvitation(invitation.id);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitation.id));
      toast.success(`You joined ${invitation.listName}`);
      if (onInvitationAccepted) {
        onInvitationAccepted();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (invitation: Invitation) => {
    if (!user) return;

    setActionLoading(invitation.id);

    try {
      await CollaborationService.declineInvitation(invitation.id);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitation.id));
      toast.success('Invitation declined');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decline invitation');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isExpiringSoon = (expiresAt: Date) => {
    const daysUntilExpiry = Math.ceil(
      (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 2;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div
          className={`animate-spin rounded-full h-8 w-8 border-b-2 ${themeColors.text.primary}`}
        ></div>
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className={`text-center py-8 ${themeColors.text.secondary}`}>
        <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No pending invitations</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invitations.map((invitation) => (
        <div
          key={invitation.id}
          className={`${themeColors.background.card} border ${themeColors.border.default} rounded-lg p-4`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h4 className={`font-medium ${themeColors.text.primary} mb-1`}>
                {invitation.listName}
              </h4>
              <p className={`text-sm ${themeColors.text.secondary}`}>
                Invited by <span className="font-medium">{invitation.invitedByUsername}</span> as{' '}
                <span className="font-medium capitalize">{invitation.role}</span>
              </p>
            </div>

            {isExpiringSoon(invitation.expiresAt) && (
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs">
                <Clock className="h-3 w-3" />
                Expires soon
              </div>
            )}
          </div>

          <div className={`text-xs ${themeColors.text.secondary} mb-3`}>
            Expires on {formatDate(invitation.expiresAt)}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleAccept(invitation)}
              disabled={actionLoading === invitation.id}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="h-4 w-4" />
              {actionLoading === invitation.id ? 'Accepting...' : 'Accept'}
            </button>

            <button
              onClick={() => handleDecline(invitation)}
              disabled={actionLoading === invitation.id}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 ${themeColors.background.card} border ${themeColors.border.default} ${themeColors.text.primary} rounded-md font-medium hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
            >
              <X className="h-4 w-4" />
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
