import { useEffect, useState } from 'react';
import { subscribePendingMutationCount } from '@/lib/localDb';

export const usePendingSyncCount = (): number => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    return subscribePendingMutationCount(setCount);
  }, []);

  return count;
};

export const useHasPendingSync = (): boolean => usePendingSyncCount() > 0;
