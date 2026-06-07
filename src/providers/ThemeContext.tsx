import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { UserService } from '@/features/auth/api/userService';
import { logger } from '@/utils/logger';
import { ThemeContext, type Theme, type ThemeContextType } from '@/providers/theme-context';

export const ThemeProvider: React.FunctionComponent<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { firebaseUser, user } = useAuth();

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      if (user?.theme) {
        return user.theme;
      }
      const savedTheme = localStorage.getItem('theme') as Theme;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        return savedTheme;
      }
      const systemPrefersDark =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return systemPrefersDark ? 'dark' : 'light';
    }
    return 'light';
  });

  const applyThemeLocally = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  }, []);

  const persistThemeIfChanged = useCallback(
    async (newTheme: Theme) => {
      if (!user || !firebaseUser || user.theme === newTheme) {
        return;
      }

      try {
        await UserService.updateUser(firebaseUser.uid, { theme: newTheme });
        logger.info(`Theme updated to ${newTheme} in Firestore for user ${user.id}`);
      } catch (error) {
        logger.error('Failed to update theme in Firestore:', error);
      }
    },
    [user, firebaseUser]
  );

  useEffect(() => {
    if (user?.theme === 'light' || user?.theme === 'dark') {
      applyThemeLocally(user.theme);
    }
  }, [user?.id, user?.theme, applyThemeLocally]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#1f2937' : '#ffffff');
    }
  }, [theme]);

  const applyTheme = applyThemeLocally;

  const setTheme = useCallback(
    (newTheme: Theme) => {
      applyThemeLocally(newTheme);
      void persistThemeIfChanged(newTheme);
    },
    [applyThemeLocally, persistThemeIfChanged]
  );

  const toggleTheme = useCallback(() => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [theme, setTheme]);

  const value: ThemeContextType = {
    theme,
    toggleTheme,
    applyTheme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
