import { useEffect, useState } from 'react';

export const isBrowserOnline = (): boolean =>
  typeof navigator === 'undefined' ? true : navigator.onLine;

export const useNetworkStatus = (): boolean => {
  const [isOnline, setIsOnline] = useState(isBrowserOnline);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};
