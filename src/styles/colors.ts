// Centralized color system using named tokens instead of hex codes
export const colors = {
  // Brand colors
  primary: {
    50: 'blue-50',
    100: 'blue-100',
    200: 'blue-200',
    300: 'blue-300',
    400: 'blue-400',
    500: 'blue-500',
    600: 'blue-600',
    700: 'blue-700',
    800: 'blue-800',
    900: 'blue-900',
  },

  // Neutral grays
  gray: {
    50: 'gray-50',
    100: 'gray-100',
    200: 'gray-200',
    300: 'gray-300',
    400: 'gray-400',
    500: 'gray-500',
    600: 'gray-600',
    700: 'gray-700',
    800: 'gray-800',
    900: 'gray-900',
  },

  // Status colors
  success: {
    50: 'green-50',
    100: 'green-100',
    200: 'green-200',
    400: 'green-400',
    500: 'green-500',
    600: 'green-600',
    700: 'green-700',
    800: 'green-800',
    900: 'green-900',
  },

  error: {
    50: 'red-50',
    100: 'red-100',
    200: 'red-200',
    400: 'red-400',
    500: 'red-500',
    600: 'red-600',
    700: 'red-700',
    800: 'red-800',
    900: 'red-900',
  },

  // Accent colors
  secondary: {
    50: 'purple-50',
    100: 'purple-100',
    200: 'purple-200',
    300: 'purple-300',
    400: 'purple-400',
    500: 'purple-500',
    600: 'purple-600',
    700: 'purple-700',
    800: 'purple-800',
    900: 'purple-900',
  },

  warning: {
    50: 'yellow-50',
    100: 'yellow-100',
    500: 'yellow-500',
    600: 'yellow-600',
    700: 'yellow-700',
  },

  // Social brand colors
  google: {
    red: 'red-600',
    redHover: 'red-700',
  },

  // Semantic colors for themes
  background: {
    primary: {
      light: 'white',
      dark: 'gray-900',
    },
    secondary: {
      light: 'gray-50',
      dark: 'gray-800',
    },
  },

  text: {
    primary: {
      light: 'gray-900',
      dark: 'white',
    },
    secondary: {
      light: 'gray-600',
      dark: 'gray-400',
    },
    muted: {
      light: 'gray-500',
      dark: 'gray-500',
    },
  },

  input: {
    background: {
      light: 'white',
      dark: 'gray-700',
    },
    text: {
      light: 'gray-900',
      dark: 'white',
    },
    border: {
      light: 'gray-300',
      dark: 'gray-600',
    },
    placeholder: {
      light: 'gray-400',
      dark: 'gray-500',
    },
  },

  border: {
    light: 'gray-200',
    dark: 'gray-700',
  },
} as const;

// Helper functions for theme-aware colors
export const getThemeColor = (colorPath: string, theme: 'light' | 'dark' = 'light'): string => {
  const pathParts = colorPath.split('.');
  type ColorValue = string | { light: string; dark: string } | Record<string, unknown>;
  let current: ColorValue = colors;

  // Navigate through the color object
  for (const part of pathParts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part as keyof typeof current] as ColorValue;
    } else {
      return colorPath; // fallback to original path
    }
  }

  // If it's a theme-aware color, return the theme-specific value
  if (typeof current === 'object' && current !== null && 'light' in current && 'dark' in current) {
    const themeColor = current as { light: string; dark: string };
    return themeColor[theme];
  }

  // Otherwise return the color value
  return typeof current === 'string' ? current : colorPath;
};

// Common color combinations using CSS variables
export const themeColors = {
  // Backgrounds
  background: {
    app: 'light-bg-app',
    card: 'light-bg-card',
    modalOverlay: 'bg-black/35 backdrop-blur-sm',
  },

  // Text colors
  text: {
    primary: 'light-text-primary',
    secondary: 'light-text-secondary',
    link: `text-${colors.primary[600]} hover:text-${colors.primary[700]} dark:text-${colors.primary[400]} dark:hover:text-${colors.primary[300]}`,
    error: `text-${colors.error[700]} dark:text-${colors.error[400]}`,
    success: `text-${colors.success[700]} dark:text-${colors.success[400]}`,
  },

  // Form styling
  form: {
    input: 'light-form-input border',
    label: 'light-form-label',
    errorBox: `bg-${colors.error[50]} dark:bg-red-900/50 border-${colors.error[200]} dark:border-red-800 text-${colors.error[700]} dark:text-red-400`,
  },

  // Button styling
  button: {
    primary: `bg-${colors.primary[600]} hover:bg-${colors.primary[700]} text-white`,
    secondary: `light-bg-card light-text-primary light-border-default border hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 dark:hover:border-blue-800 transition-colors`,
    google: `light-bg-card light-text-primary light-border-default border hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 dark:hover:border-blue-800 transition-colors`,
    icon: `hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-200 transition-colors`,
  },

  // Map elements
  map: {
    label:
      'bg-gray-950/95 dark:bg-white/95 text-white dark:text-gray-900 border border-gray-800 dark:border-gray-200',
    markerBorder: 'border-white dark:border-gray-900',
  },

  // Border colors
  border: {
    default: 'light-border-default',
  },
};
