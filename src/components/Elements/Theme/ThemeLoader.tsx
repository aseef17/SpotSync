import React, { useEffect } from 'react';
import { logger } from '@/utils/logger';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { UserService } from '@/features/auth/api/userService';

export const ThemeLoader: React.FunctionComponent = () => {
  const { user } = useAuth();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (user) {
      // Load user's theme preference when they log in
      UserService.getUser(user.id)
        .then((userData: { theme?: string } | null) => {
          if (userData?.theme) {
            setTheme(userData.theme as 'light' | 'dark');
          }
        })
        .catch((error: Error) => {
          logger.error('Error loading user theme:', error);
        });
    }
  }, [user, setTheme]);

  // This component doesn't render anything, just handles theme loading
  return null;
};
