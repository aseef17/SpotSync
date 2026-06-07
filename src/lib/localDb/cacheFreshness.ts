import { toMilliseconds } from '@/utils/date';

type Timestamped = { updatedAt?: unknown };

export function isIncomingCacheUpdateNewer(
  existing: Timestamped | null | undefined,
  incoming: Timestamped
): boolean {
  if (!existing) {
    return true;
  }

  const existingMs = toMilliseconds(existing.updatedAt);
  const incomingMs = toMilliseconds(incoming.updatedAt);

  if (existingMs === 0 || incomingMs === 0) {
    return true;
  }

  return incomingMs >= existingMs;
}
