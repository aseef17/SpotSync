export function listViewRemountKey(options: {
  userId: string | undefined;
  listId: string | undefined;
}): string {
  const { userId, listId } = options;
  return `${userId ?? 'anonymous'}:${listId ?? ''}`;
}

export function shouldClearStaleListView(options: {
  listId: string | undefined;
  hadListFromContext: boolean;
  hasListFromContext: boolean;
}): boolean {
  const { listId, hadListFromContext, hasListFromContext } = options;
  return Boolean(listId && hadListFromContext && !hasListFromContext);
}

export function isFirestorePermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'permission-denied'
  );
}
