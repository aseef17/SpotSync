import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { UserService } from '@/features/auth/api/userService';
import { logger } from '@/utils/logger';
import { ThemeContext, type Theme, type ThemeContextType } from '@/providers/theme-context';

export const ThemeProvider: React.FunctionComponent<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { firebaseUser, user, loading: authLoading } = useAuth();

  // Initialize theme from localStorage or system preference
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      // Priority: user profile > localStorage > system preference
      if (user?.theme) {
        return user.theme;
      }
      const savedTheme = localStorage.getItem('theme') as Theme;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        return savedTheme;
      }
      // Fallback to system preference
      const systemPrefersDark =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return systemPrefersDark ? 'dark' : 'light';
    }
    return 'light';
  });

  // Function to update theme in Firestore and localStorage
  const updateThemeInFirestore = useCallback(
    async (newTheme: Theme) => {
      if (user && firebaseUser) {
        try {
          await UserService.updateUser(firebaseUser.uid, { theme: newTheme });
          logger.info(`Theme updated to ${newTheme} in Firestore for user ${user.id}`);
        } catch (error) {
          logger.error('Failed to update theme in Firestore:', error);
        }
      }
      // Always update localStorage for immediate access
      localStorage.setItem('theme', newTheme);
    },
    [user, firebaseUser]
  );

  const isThemeLoaded = !authLoading;

  // Effect to apply theme to document and update meta tag
  useEffect(() => {
    if (isThemeLoaded) {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(theme);

      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'dark' ? '#1f2937' : '#ffffff');
      }
    }
  }, [theme, isThemeLoaded]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      updateThemeInFirestore(newTheme);
    },
    [updateThemeInFirestore]
  );

  const toggleTheme = useCallback(() => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [theme, setTheme]);

  // Don't render children until theme is loaded to prevent FOUC
  if (!isThemeLoaded) {
    return null;
  }

  const value: ThemeContextType = {
    theme,
    toggleTheme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
