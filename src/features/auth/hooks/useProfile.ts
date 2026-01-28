import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { UserService } from '@/features/auth/api/userService';
import { logger } from '@/utils/logger';

export const useProfile = () => {
  const { user, firebaseUser } = useAuth();
  
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [collaboratorNotifications, setCollaboratorNotifications] = useState(true);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setUsername(user.username || '');

      // Load notification preferences from localStorage
      const prefs = localStorage.getItem('notification-prefs');
      if (prefs) {
        const parsed = JSON.parse(prefs);
        setCollaboratorNotifications(parsed.collaborator !== false); // default true
      }
    }
  }, [user]);

  // Debounced username availability check
  const checkUsernameAvailability = useCallback(
    async (newUsername: string) => {
      if (!newUsername || newUsername.length < 3 || newUsername === user?.username) {
        setUsernameAvailable(null);
        return;
      }

      setCheckingUsername(true);
      try {
        const exists = await UserService.checkUsernameExists(newUsername);
        setUsernameAvailable(!exists);
      } catch (err) {
        logger.error('Error checking username:', err);
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    },
    [user]
  );

  // Debounce username check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (username && username !== user?.username) {
        checkUsernameAvailability(username);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [username, checkUsernameAvailability, user]);

  const saveProfile = async () => {
    if (!firebaseUser) return;

    setLoading(true);
    try {
      await UserService.updateUser(firebaseUser.uid, {
        displayName,
        username,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      logger.error('Failed to update profile:', error);
      throw error;
    } finally {
      setLoading(false);
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
    loading,
    saveSuccess,
    collaboratorNotifications,
    setCollaboratorNotifications: setNotificationsEnabled,
    usernameAvailable,
    checkingUsername,
    saveProfile
  };
};
