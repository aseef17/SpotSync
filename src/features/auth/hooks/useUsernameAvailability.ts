import { useState, useEffect, useCallback, useRef } from 'react';
import { UserService } from '@/features/auth/api/userService';
import { logger } from '@/utils/logger';

export const useUsernameAvailability = (username: string, currentUsername?: string) => {
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const latestCheckRef = useRef(0);

  const checkUsernameAvailability = useCallback(
    async (newUsername: string, checkId: number) => {
      if (!newUsername || newUsername.length < 3 || newUsername === currentUsername) {
        if (checkId === latestCheckRef.current) {
          setUsernameAvailable(null);
          setCheckingUsername(false);
        }
        return;
      }

      setCheckingUsername(true);
      try {
        const exists = await UserService.checkUsernameExists(newUsername);
        if (checkId !== latestCheckRef.current) {
          return;
        }
        setUsernameAvailable(!exists);
      } catch (err) {
        if (checkId !== latestCheckRef.current) {
          return;
        }
        logger.error('Error checking username:', err);
        setUsernameAvailable(null);
      } finally {
        if (checkId === latestCheckRef.current) {
          setCheckingUsername(false);
        }
      }
    },
    [currentUsername]
  );

  useEffect(() => {
    const checkId = ++latestCheckRef.current;
    const timer = setTimeout(() => {
      if (username && username !== currentUsername) {
        void checkUsernameAvailability(username, checkId);
      } else {
        setUsernameAvailable(null);
        setCheckingUsername(false);
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
