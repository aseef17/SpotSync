import { toast } from 'sonner';

/** Temporary prod-visible sync tracing — remove in follow-up PR. */
const SYNC_DEBUG_ENABLED = true;

export function syncDebug(phase: string, detail?: Record<string, unknown>): void {
  if (!SYNC_DEBUG_ENABLED) {
    return;
  }

  const payload = detail ? ` ${JSON.stringify(detail)}` : '';
  console.info(`[sync-debug] ${phase}${payload}`);

  if (import.meta.env.DEV) {
    return;
  }

  toast.message(`Sync: ${phase}`, {
    description: detail ? JSON.stringify(detail).slice(0, 120) : undefined,
    duration: 2500,
  });
}
