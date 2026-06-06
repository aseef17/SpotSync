import { useState, useEffect, useCallback } from 'react';
import { UserService } from '@/features/auth/api/userService';
import { logger } from '@/utils/logger';

export const useUsernameAvailability = (username: string, currentUsername?: string) => {
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const checkUsernameAvailability = useCallback(
    async (newUsername: string) => {
      if (!newUsername || newUsername.length < 3 || newUsername === currentUsername) {
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
    [currentUsername]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (username && username !== currentUsername) {
        checkUsernameAvailability(username);
      } else {
        setUsernameAvailable(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, checkUsernameAvailability, currentUsername]);

  const isUsernameValid =
    username === currentUsername || (username.length >= 3 && usernameAvailable === true);

  return {
    usernameAvailable,
    checkingUsername,
    isUsernameValid,
  };
};
