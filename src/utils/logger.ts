// Development-only logging utility
// Console statements are automatically removed in production builds

export const logger = {
  error: (message: string, ...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.error(message, ...args);
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
