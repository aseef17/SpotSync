export function listViewRemountKey(options: {
  userId: string | undefined;
  listId: string | undefined;
}): string {
  const { userId, listId } = options;
  return `${userId ?? 'anonymous'}:${listId ?? ''}`;
}

const ACCESS_REVOKED_STORAGE_PREFIX = 'listAccessRevoked:';

export function listAccessRevokedStorageKey(userId: string, listId: string): string {
  return `${ACCESS_REVOKED_STORAGE_PREFIX}${userId}:${listId}`;
}

export function readPersistedListAccessRevoked(
  userId: string | undefined,
  listId: string | undefined
): boolean {
  if (!userId || !listId || typeof sessionStorage === 'undefined') {
    return false;
  }
  return sessionStorage.getItem(listAccessRevokedStorageKey(userId, listId)) === '1';
}

export function writePersistedListAccessRevoked(
  userId: string | undefined,
  listId: string | undefined,
  revoked: boolean
): void {
  if (!userId || !listId || typeof sessionStorage === 'undefined') {
    return;
  }
  const key = listAccessRevokedStorageKey(userId, listId);
  if (revoked) {
    sessionStorage.setItem(key, '1');
  } else {
    sessionStorage.removeItem(key);
  }
}

export function shouldClearStaleListView(options: {
  listId: string | undefined;
  hadListFromContext: boolean;
  hasListFromContext: boolean;
  listsLoading?: boolean;
}): boolean {
  const { listId, hadListFromContext, hasListFromContext, listsLoading } = options;
  // ListsProvider remounts reset lists to [] while loading; do not treat that as revocation.
  if (listsLoading) {
    return false;
  }
  return Boolean(listId && hadListFromContext && !hasListFromContext);
}

export function shouldTrustPrivateListSnapshot(options: {
  fromCache: boolean;
  isPublic: boolean;
  serverVerified: boolean;
}): boolean {
  if (!options.fromCache || options.isPublic) {
    return true;
  }
  return options.serverVerified;
}

export function isFirestorePermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'permission-denied'
  );
}
