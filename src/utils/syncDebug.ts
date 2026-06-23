/** Temporary prod-visible sync tracing — remove in follow-up PR. */
const SYNC_DEBUG_ENABLED = true;

export function syncDebug(phase: string, detail?: Record<string, unknown>): void {
  if (!SYNC_DEBUG_ENABLED) {
    return;
  }

  const payload = detail ? ` ${JSON.stringify(detail)}` : '';
  console.info(`[sync-debug] ${phase}${payload}`);
}
