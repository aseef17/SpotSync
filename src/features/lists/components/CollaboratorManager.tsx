import React, { useState, useEffect, useCallback } from 'react';
import { Users, Mail, UserX, Clock, X } from 'lucide-react';
import { CollaborationService } from '@/features/lists/api/collaborationService';
import { themeColors } from '@/styles/colors';
import { CustomDropdown } from '@/components/Elements/Dropdown/CustomDropdown';
import { ConfirmDialog } from '@/components/Elements/ConfirmationDialog/ConfirmationDialog';
import type { PlaceList, Collaborator } from '@/features/lists/types/list';
import type { Invitation } from '@/features/lists/types/invitation';
import { logger } from '@/utils/logger';

interface CollaboratorManagerProps {
  list: PlaceList;
  currentUserId: string;
  onUpdate: () => void;
}

export const CollaboratorManager: React.FunctionComponent<CollaboratorManagerProps> = ({
  list,
  currentUserId,
  onUpdate,
}) => {
  const [inviteeIdentifier, setInviteeIdentifier] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);

  // Confirmation state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'info',
  });

  const currentUser = list.collaborators.find((c: Collaborator) => c.userId === currentUserId);
  const isOwner = currentUser?.permission === 'owner';

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteeIdentifier.trim()) return;

    setLoading(true);
    setError('');

    // Client-side validation: Check if user already has a pending invitation
    const isEmailInvite = inviteeIdentifier.includes('@');
    const alreadyPending = pendingInvitations.some((inv) =>
      isEmailInvite
        ? inv.invitedEmail === inviteeIdentifier.trim()
        : inv.invitedUsername === inviteeIdentifier.trim()
    );

    if (alreadyPending) {
      setError('This user already has a pending invitation');
      setLoading(false);
      return;
    }

    try {
      await CollaborationService.sendInvitation(
        list.id,
        inviteeIdentifier.trim(),
        inviteRole,
        currentUserId,
        currentUser?.username || ''
      );

      setInviteeIdentifier('');
      loadPendingInvitations(); // Refresh pending list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Collaborator',
      message: 'Are you sure you want to remove this collaborator? This action cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        setLoading(true);
        setError('');
        try {
          await CollaborationService.removeCollaborator(list.id, collaboratorId, currentUserId);
          onUpdate();
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to remove collaborator');
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleChangeRole = async (collaboratorId: string, newRole: 'editor' | 'viewer') => {
    setLoading(true);
    setError('');

    try {
      await CollaborationService.updateCollaboratorRole(
        list.id,
        collaboratorId,
        newRole,
        currentUserId
      );
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setLoading(false);
    }
  };

  const loadPendingInvitations = useCallback(async () => {
    try {
      const invites = await CollaborationService.getPendingInvitationsForList(list.id);
      setPendingInvitations(invites);
    } catch (err) {
      logger.error('Error loading pending invitations:', err);
    }
  }, [list.id]);

  const handleCancelInvitation = async (invitationId: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Cancel Invitation',
      message: 'Are you sure you want to cancel this invitation?',
      variant: 'warning',
      onConfirm: async () => {
        setLoading(true);
        setError('');
        try {
          await CollaborationService.cancelInvitation(invitationId);
          loadPendingInvitations();
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to cancel invitation');
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        } finally {
          setLoading(false);
        }
      },
    });
  };

  useEffect(() => {
    loadPendingInvitations();
  }, [list.id, loadPendingInvitations]);

  return (
    <div className={`${themeColors.background.card} pt-2`}>
      <div className="flex items-center gap-2 mb-8">
        <Users className={`h-5 w-5 ${themeColors.text.primary}`} />
        <h3 className={`text-lg font-semibold ${themeColors.text.primary}`}>Collaborators</h3>
      </div>

      {/* Current Collaborators */}
      <div className="space-y-4 mb-10">
        {list.collaborators.map((collaborator: Collaborator) => (
          <div
            key={collaborator.userId}
            className={`flex items-center justify-between p-4 rounded-xl ${themeColors.background.app} border ${themeColors.border.default}`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full ${themeColors.background.card} border ${themeColors.border.default} flex items-center justify-center`}
              >
                <Users className={`h-5 w-5 ${themeColors.text.secondary}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`font-medium ${themeColors.text.primary} break-words`}>
                  {collaborator.username}
                  {collaborator.userId === currentUserId && (
                    <span className={`ml-2 text-xs ${themeColors.text.secondary}`}>(You)</span>
                  )}
                </div>
                <div className={`text-sm ${themeColors.text.secondary} break-words`}>
                  {collaborator.email}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Role Badge/Dropdown */}
              {isOwner && collaborator.permission !== 'owner' ? (
                <CustomDropdown
                  value={collaborator.permission}
                  options={[
                    { value: 'editor', label: 'Editor' },
                    { value: 'viewer', label: 'Viewer' },
                  ]}
                  onChange={(value) =>
                    handleChangeRole(collaborator.userId, value as 'editor' | 'viewer')
                  }
                  className="w-20"
                />
              ) : (
                <span
                  className={`px-3 py-1 rounded-md text-sm ${themeColors.background.card} border ${themeColors.border.default} capitalize`}
                >
                  {collaborator.permission}
                </span>
              )}

              {/* Remove Button */}
              {isOwner && collaborator.permission !== 'owner' && (
                <button
                  onClick={() => handleRemoveCollaborator(collaborator.userId)}
                  disabled={loading}
                  className={`p-1.5 rounded-md ${themeColors.background.card} border ${themeColors.border.default} ${themeColors.text.secondary} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                  title="Remove collaborator"
                >
                  <UserX className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className={`border-t ${themeColors.border.default} pt-8 mb-10`}>
          <div className="flex items-center gap-2 mb-4">
            <Clock className={`h-4 w-4 ${themeColors.text.secondary}`} />
            <h4 className={`text-sm font-medium ${themeColors.text.primary}`}>
              Pending Invitations ({pendingInvitations.length})
            </h4>
          </div>
          <div className="space-y-2">
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className={`flex items-center justify-between p-3 rounded-lg ${themeColors.background.app} border ${themeColors.border.default}`}
              >
                <div>
                  <div className={`text-sm font-medium ${themeColors.text.primary}`}>
                    {invitation.invitedEmail || invitation.invitedUsername}
                  </div>
                  <div className={`text-xs ${themeColors.text.secondary}`}>
                    {invitation.role === 'editor' ? 'Editor' : 'Viewer'} • Expires{' '}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleCancelInvitation(invitation.id)}
                  disabled={loading}
                  className={`p-1.5 rounded-md ${themeColors.background.card} border ${themeColors.border.default} ${themeColors.text.secondary} hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors`}
                  title="Cancel invitation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Form */}
      {(isOwner || currentUser?.permission === 'editor') && (
        <div className={`border-t ${themeColors.border.default} pt-8`}>
          <h4 className={`text-base font-semibold ${themeColors.text.primary} mb-4`}>
            Invite Collaborator
          </h4>

          {error && (
            <div className="mb-3 p-3 bg-white dark:bg-gray-800 border-l-4 border-red-500 shadow-sm text-sm text-gray-900 dark:text-gray-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSendInvitation} className="space-y-4">
            <div>
              <input
                type="text"
                value={inviteeIdentifier}
                onChange={(e) => setInviteeIdentifier(e.target.value)}
                placeholder="Email or username"
                className={`w-full px-4 py-3 ${themeColors.form.input} rounded-xl border ${themeColors.border.default} shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                disabled={loading}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <CustomDropdown
                value={inviteRole}
                options={[
                  { value: 'editor', label: 'Editor (can edit)' },
                  { value: 'viewer', label: 'Viewer (read-only)' },
                ]}
                onChange={(value) => setInviteRole(value as 'editor' | 'viewer')}
                className="flex-1"
              />

              <button
                type="submit"
                disabled={loading || !inviteeIdentifier.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                <Mail className="h-4 w-4" />
                {loading ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        variant={confirmState.variant}
        isLoading={loading}
      />
    </div>
  );
};
