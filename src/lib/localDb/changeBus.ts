type ChangeListener = () => void;

const listenersByTopic = new Map<string, Set<ChangeListener>>();

export const changeTopics = {
  place: (placeId: string) => `place:${placeId}`,
  placesForList: (listId: string) => `places:list:${listId}`,
  list: (listId: string) => `list:${listId}`,
  userLists: (userId: string) => `lists:user:${userId}`,
  user: (userId: string) => `user:${userId}`,
  invitations: () => 'invitations',
} as const;

export function subscribeToChanges(topic: string, listener: ChangeListener): () => void {
  let listeners = listenersByTopic.get(topic);
  if (!listeners) {
    listeners = new Set();
    listenersByTopic.set(topic, listeners);
  }

  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      listenersByTopic.delete(topic);
    }
  };
}

export function emitChange(topic: string): void {
  const listeners = listenersByTopic.get(topic);
  if (!listeners) {
    return;
  }

  listeners.forEach((listener) => listener());
}

export function clearAllChangeListeners(): void {
  listenersByTopic.clear();
}
