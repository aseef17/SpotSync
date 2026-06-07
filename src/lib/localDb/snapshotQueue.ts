import { logger } from '@/utils/logger';

export function enqueueSnapshotTask(
  chains: Map<string, Promise<void>>,
  key: string,
  task: () => Promise<void>
): void {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous
    .then(task)
    .catch((error) => {
      logger.error('Error applying sync snapshot:', error);
    })
    .finally(() => {
      if (chains.get(key) === next) {
        chains.delete(key);
      }
    });
  chains.set(key, next);
}
