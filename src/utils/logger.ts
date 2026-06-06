import { getFirebaseAnalytics } from '@/lib/firebase';
import { logEvent } from 'firebase/analytics';

// Development-only logging utility
// Console statements are automatically removed in production builds

export const logger = {
  error: (message: string, ...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.error(message, ...args);
    }
    if (!import.meta.env.DEV) {
      void getFirebaseAnalytics().then((analytics) => {
        if (!analytics) return;
        try {
          logEvent(analytics, 'exception', {
            description:
              `${message} ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`.substring(
                0,
                100
              ),
            fatal: false,
          });
        } catch {
          // Ignore analytics errors to prevent loops
        }
      });
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.warn(message, ...args);
    }
  },
  info: (message: string, ...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.info(message, ...args);
    }
  },
  debug: (message: string, ...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.debug(message, ...args);
    }
  },
};
