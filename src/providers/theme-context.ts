import { createContext } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  /** Apply theme locally (no remote sync). Used when hydrating from the user profile. */
  applyTheme: (theme: Theme) => void;
  /** Apply theme and persist to the user profile when the value changed. */
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
