type Teardown = () => void;

interface RegistryEntry {
  teardown: Teardown;
  refCount: number;
}

const TEARDOWN_GRACE_MS = 100;

const entries = new Map<string, RegistryEntry>();
const pendingTeardowns = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingTeardown(key: string): void {
  const timer = pendingTeardowns.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingTeardowns.delete(key);
  }
}

/** True when a subscription entry already exists (create() will be skipped on acquire). */
export function hasSubscriptionEntry(key: string): boolean {
  return entries.has(key);
}

export function acquireSubscription(key: string, create: () => Teardown): () => void {
  cancelPendingTeardown(key);

  let entry = entries.get(key);
  if (!entry) {
    entry = {
      teardown: create(),
      refCount: 0,
    };
    entries.set(key, entry);
  }

  entry.refCount += 1;

  return () => {
    const current = entries.get(key);
    if (!current) {
      return;
    }

    current.refCount -= 1;
    if (current.refCount <= 0) {
      pendingTeardowns.set(
        key,
        setTimeout(() => {
          pendingTeardowns.delete(key);
          const still = entries.get(key);
          if (still && still.refCount <= 0) {
            still.teardown();
            entries.delete(key);
          }
        }, TEARDOWN_GRACE_MS)
      );
    }
  };
}

export function clearAllSubscriptions(): void {
  pendingTeardowns.forEach((timer) => clearTimeout(timer));
  pendingTeardowns.clear();
  entries.forEach((entry) => {
    try {
      entry.teardown();
    } catch {
      // Best-effort teardown during logout/account switch.
    }
  });
  entries.clear();
}
