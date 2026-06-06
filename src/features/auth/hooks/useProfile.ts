import { useState } from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { UserService } from '@/features/auth/api/userService';
import { logger } from '@/utils/logger';
import { useUsernameAvailability } from '@/features/auth/hooks/useUsernameAvailability';

const getCollaboratorNotificationsPref = (): boolean => {
  const prefs = localStorage.getItem('notification-prefs');
  if (prefs) {
    const parsed = JSON.parse(prefs);
    return parsed.collaborator !== false;
  }
  return true;
};

export const useProfile = () => {
  const { user, firebaseUser } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [collaboratorNotifications, setCollaboratorNotifications] = useState(true);
  const [syncedUserId, setSyncedUserId] = useState<string | undefined>(undefined);

  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id);
    setDisplayName(user.displayName || '');
    setUsername(user.username || '');
    setCollaboratorNotifications(getCollaboratorNotificationsPref());
  }

  const { usernameAvailable, checkingUsername, isUsernameValid } = useUsernameAvailability(
    username,
    user?.username
  );

  const saveProfile = async () => {
    if (!firebaseUser) return;

    if (!isUsernameValid) {
      throw new Error('Username is not available');
    }

    try {
      await UserService.updateProfileWithUsername(
        firebaseUser.uid,
        {
          displayName,
          username,
        },
        user?.username
      );
    } catch (error) {
      logger.error('Failed to update profile:', error);
      throw error;
    }
  };

  const setNotificationsEnabled = (enabled: boolean) => {
    setCollaboratorNotifications(enabled);
    localStorage.setItem(
      'notification-prefs',
      JSON.stringify({
        collaborator: enabled,
      })
    );
  };

  return {
    displayName,
    setDisplayName,
    username,
    setUsername,
    collaboratorNotifications,
    setCollaboratorNotifications: setNotificationsEnabled,
    usernameAvailable,
    checkingUsername,
    isUsernameValid,
    saveProfile,
  };
};
