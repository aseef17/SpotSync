/**
 * Stages whether the next list publish came from Firestore cache or server.
 * listRepository consumes this when the change bus fires after listSync writes.
 */
const pendingListPublishFromCache = new Map<string, boolean>();

export function stageListPublishFromCache(listId: string, fromCache: boolean): void {
  pendingListPublishFromCache.set(listId, fromCache);
}

export function consumeListPublishFromCache(listId: string): boolean {
  const staged = pendingListPublishFromCache.get(listId);
  if (staged === undefined) {
    return true;
  }
  pendingListPublishFromCache.delete(listId);
  return staged;
}

export function resetListPublishMetaForTests(): void {
  pendingListPublishFromCache.clear();
}
