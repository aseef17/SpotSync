const TEARDOWN_GRACE_MS = 100;

const pendingTeardowns = new Map<string, ReturnType<typeof setTimeout>>();

export function cancelScheduledTeardown(key: string): void {
  const timer = pendingTeardowns.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingTeardowns.delete(key);
  }
}

export function scheduleTeardown(
  key: string,
  teardown: () => void,
  shouldTeardown: () => boolean
): void {
  cancelScheduledTeardown(key);
  const timer = setTimeout(() => {
    pendingTeardowns.delete(key);
    if (shouldTeardown()) {
      teardown();
    }
  }, TEARDOWN_GRACE_MS);
  pendingTeardowns.set(key, timer);
}

export function cancelAllScheduledTeardowns(): void {
  pendingTeardowns.forEach((timer) => clearTimeout(timer));
  pendingTeardowns.clear();
}
