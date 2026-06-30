import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isFirestorePermissionDenied,
  listAccessRevokedStorageKey,
  listSavedPrivateDeniedStorageKey,
  listViewRemountKey,
  readPersistedListAccessRevoked,
  readPersistedListSavedPrivateDenied,
  shouldClearListOnNullSnapshot,
  shouldClearStaleListView,
  shouldHydrateListFromPersistentCache,
  shouldTrustPrivateListSnapshot,
  writePersistedListAccessRevoked,
  writePersistedListSavedPrivateDenied,
} from '@/features/lists/hooks/listViewAccess';

describe('shouldClearStaleListView', () => {
  it('clears when a list disappears from context while still mounted', () => {
    expect(
      shouldClearStaleListView({
        listId: 'list-1',
        hadListFromContext: true,
        hasListFromContext: false,
      })
    ).toBe(true);
  });

  it('does not clear deep-linked lists that never appeared in context', () => {
    expect(
      shouldClearStaleListView({
        listId: 'list-1',
        hadListFromContext: false,
        hasListFromContext: false,
      })
    ).toBe(false);
  });

  it('does not clear while the list is still present in context', () => {
    expect(
      shouldClearStaleListView({
        listId: 'list-1',
        hadListFromContext: true,
        hasListFromContext: true,
      })
    ).toBe(false);
  });

  it('does not clear while lists are reloading after a provider remount', () => {
    expect(
      shouldClearStaleListView({
        listId: 'list-1',
        hadListFromContext: true,
        hasListFromContext: false,
        listsLoading: true,
      })
    ).toBe(false);
  });
});

describe('listViewRemountKey', () => {
  it('changes when the signed-in user changes so stale deep-linked data is dropped', () => {
    const listId = 'list-1';
    expect(listViewRemountKey({ userId: 'user-a', listId })).not.toBe(
      listViewRemountKey({ userId: 'user-b', listId })
    );
  });

  it('stays stable for the same user and list', () => {
    expect(listViewRemountKey({ userId: 'user-a', listId: 'list-1' })).toBe(
      listViewRemountKey({ userId: 'user-a', listId: 'list-1' })
    );
  });
});

describe('isFirestorePermissionDenied', () => {
  it('detects Firestore permission errors', () => {
    expect(isFirestorePermissionDenied({ code: 'permission-denied' })).toBe(true);
    expect(isFirestorePermissionDenied(new Error('offline'))).toBe(false);
  });
});

describe('shouldClearListOnNullSnapshot', () => {
  it('waits on the initial empty cache read before clearing the view', () => {
    expect(
      shouldClearListOnNullSnapshot({
        fromCache: true,
        receivedListData: false,
      })
    ).toBe(false);
  });

  it('clears after sync removes a list that was previously shown from cache', () => {
    expect(
      shouldClearListOnNullSnapshot({
        fromCache: true,
        receivedListData: true,
      })
    ).toBe(true);
  });

  it('clears when the server confirms the list is gone', () => {
    expect(
      shouldClearListOnNullSnapshot({
        fromCache: false,
        receivedListData: false,
      })
    ).toBe(true);
  });
});

describe('shouldTrustPrivateListSnapshot', () => {
  it('allows server snapshots for private lists', () => {
    expect(
      shouldTrustPrivateListSnapshot({
        fromCache: false,
        isPublic: false,
        serverVerified: false,
      })
    ).toBe(true);
  });

  it('allows cached public list snapshots', () => {
    expect(
      shouldTrustPrivateListSnapshot({
        fromCache: true,
        isPublic: true,
        serverVerified: false,
      })
    ).toBe(true);
  });

  it('blocks cached private snapshots until server access is confirmed', () => {
    expect(
      shouldTrustPrivateListSnapshot({
        fromCache: true,
        isPublic: false,
        serverVerified: false,
      })
    ).toBe(false);
  });

  it('allows cached private snapshots after server access is confirmed', () => {
    expect(
      shouldTrustPrivateListSnapshot({
        fromCache: true,
        isPublic: false,
        serverVerified: true,
      })
    ).toBe(true);
  });
});

describe('shouldHydrateListFromPersistentCache', () => {
  it('blocks cached private lists until server access is confirmed', () => {
    expect(
      shouldHydrateListFromPersistentCache({
        grantFromAccessRules: true,
        isPublic: false,
        serverVerified: false,
      })
    ).toBe(false);
  });

  it('allows cached private lists after server access is confirmed', () => {
    expect(
      shouldHydrateListFromPersistentCache({
        grantFromAccessRules: true,
        isPublic: false,
        serverVerified: true,
      })
    ).toBe(true);
  });

  it('does not hydrate when access rules deny the cached list', () => {
    expect(
      shouldHydrateListFromPersistentCache({
        grantFromAccessRules: false,
        isPublic: false,
        serverVerified: true,
      })
    ).toBe(false);
  });
});

describe('list access revocation persistence', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  it('builds stable storage keys per user and list', () => {
    expect(listAccessRevokedStorageKey('user-a', 'list-1')).toBe('listAccessRevoked:user-a:list-1');
  });

  it('persists and restores sticky revocation across remounts', () => {
    writePersistedListAccessRevoked('user-a', 'list-1', true);
    expect(readPersistedListAccessRevoked('user-a', 'list-1')).toBe(true);
    expect(readPersistedListAccessRevoked('user-b', 'list-1')).toBe(false);
  });

  it('clears persisted revocation when access is restored', () => {
    writePersistedListAccessRevoked('user-a', 'list-1', true);
    writePersistedListAccessRevoked('user-a', 'list-1', false);
    expect(readPersistedListAccessRevoked('user-a', 'list-1')).toBe(false);
  });
});

describe('saved private denial persistence', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  it('builds stable storage keys per user and list', () => {
    expect(listSavedPrivateDeniedStorageKey('user-a', 'list-1')).toBe(
      'listSavedPrivateDenied:user-a:list-1'
    );
  });

  it('persists saved-private denial across reloads without setting accessRevoked', () => {
    writePersistedListSavedPrivateDenied('user-a', 'list-1', true);
    expect(readPersistedListSavedPrivateDenied('user-a', 'list-1')).toBe(true);
    expect(readPersistedListAccessRevoked('user-a', 'list-1')).toBe(false);
  });

  it('clears persisted saved-private denial when trusted context grants', () => {
    writePersistedListSavedPrivateDenied('user-a', 'list-1', true);
    writePersistedListSavedPrivateDenied('user-a', 'list-1', false);
    expect(readPersistedListSavedPrivateDenied('user-a', 'list-1')).toBe(false);
  });
});
