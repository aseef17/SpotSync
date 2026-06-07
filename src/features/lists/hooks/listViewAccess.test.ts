import { describe, expect, it } from 'vitest';
import {
  isFirestorePermissionDenied,
  shouldClearStaleListView,
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
});

describe('isFirestorePermissionDenied', () => {
  it('detects Firestore permission errors', () => {
    expect(isFirestorePermissionDenied({ code: 'permission-denied' })).toBe(true);
    expect(isFirestorePermissionDenied(new Error('offline'))).toBe(false);
  });
});
