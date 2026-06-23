const STORAGE_KEY = 'spotsync:sync-debug';
const URL_FLAG = 'syncDebug';
const MAX_BUFFER = 250;

type SyncDebugBuffer = string[];

declare global {
  interface Window {
    __SPOTSYNC_SYNC_DEBUG__?: SyncDebugBuffer;
  }
}

function getBuffer(): SyncDebugBuffer {
  if (typeof window === 'undefined') {
    return [];
  }
  if (!window.__SPOTSYNC_SYNC_DEBUG__) {
    window.__SPOTSYNC_SYNC_DEBUG__ = [];
  }
  return window.__SPOTSYNC_SYNC_DEBUG__;
}

function readUrlFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return new URLSearchParams(window.location.search).has(URL_FLAG);
}

export function isSyncDebugEnabled(): boolean {
  if (import.meta.env.VITE_SYNC_DEBUG === 'true') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    /* private mode */
  }
  return readUrlFlag();
}

function persistUrlFlag(): void {
  if (!readUrlFlag() || typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private mode */
  }
}

if (typeof window !== 'undefined') {
  persistUrlFlag();
}

function safeJson(detail: Record<string, unknown>): string {
  try {
    return JSON.stringify(detail, (_key, value) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          code: 'code' in value ? String(value.code) : undefined,
        };
      }
      return value;
    });
  } catch {
    return '[unserializable]';
  }
}

export function syncDebug(phase: string, detail?: Record<string, unknown>): void {
  if (!isSyncDebugEnabled()) {
    return;
  }

  const line = `[sync-debug] ${phase}${detail ? ` ${safeJson(detail)}` : ''}`;
  const buffer = getBuffer();
  buffer.push(`${new Date().toISOString()} ${line}`);
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER);
  }

  console.log(line);
}

export function syncDebugError(
  phase: string,
  error: unknown,
  detail?: Record<string, unknown>
): void {
  const err =
    error && typeof error === 'object'
      ? {
          message: 'message' in error ? String(error.message) : String(error),
          code: 'code' in error ? String(error.code) : undefined,
          name: 'name' in error ? String(error.name) : undefined,
        }
      : { message: String(error) };
  syncDebug(phase, { ...detail, error: err });
}
