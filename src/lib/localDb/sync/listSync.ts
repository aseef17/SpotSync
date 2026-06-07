import { collection, doc, onSnapshot, or, query, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import { changeTopics, emitChange } from '@/lib/localDb/changeBus';
import { acquireSubscription } from '@/lib/localDb/subscriptionRegistry';
import { removeCachedList, upsertCachedList } from '@/lib/localDb/listCache';
import { removeCachedUserList, upsertCachedUserLists } from '@/lib/localDb/userListsCache';
import { listConverter } from '@/features/lists/api/listFirestore';
import {
  fetchSavedListsByIds,
  hasRemovedSavedListIds,
  shouldCommitSavedListFetch,
} from '@/features/lists/api/savedListsFetch';
import { reconcileSavedLists } from '@/features/lists/api/reconcileSavedLists';
import type { PlaceList } from '@/features/lists/types/list';

function getExpectedCollaboratorIds(list: PlaceList): string[] {
  return Array.from(new Set([list.ownerId, ...(list.collaborators?.map((c) => c.userId) || [])]));
}

function getExpectedEditorIds(list: PlaceList): string[] {
  return Array.from(
    new Set(
      (list.collaborators || [])
        .filter((c) => c.permission === 'owner' || c.permission === 'editor')
        .map((c) => c.userId)
    )
  );
}

function needsListPermissionSync(data: PlaceList): Partial<PlaceList> | null {
  const updates: Partial<PlaceList> = {};
  const expectedIds = getExpectedCollaboratorIds(data);
  const collaboratorIdsMatch =
    data.collaboratorIds &&
    data.collaboratorIds.length === expectedIds.length &&
    expectedIds.every((id) => data.collaboratorIds!.includes(id));
  if (!collaboratorIdsMatch) {
    updates.collaboratorIds = expectedIds;
  }

  const expectedEditorIds = getExpectedEditorIds(data);
  const editorIdsMatch =
    data.editorIds &&
    data.editorIds.length === expectedEditorIds.length &&
    expectedEditorIds.every((id) => data.editorIds!.includes(id));
  if (!editorIdsMatch) {
    updates.editorIds = expectedEditorIds;
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

interface UserListsSyncState {
  ownedLists: PlaceList[];
  savedLists: PlaceList[];
  fetchSavedListsSeq: number;
}

const userListsState = new Map<string, UserListsSyncState>();

async function publishUserLists(userId: string): Promise<void> {
  const state = userListsState.get(userId);
  if (!state) {
    return;
  }

  const existingIds = new Set(state.ownedLists.map((list) => list.id));
  const merged = [
    ...state.ownedLists,
    ...state.savedLists.filter((list) => !existingIds.has(list.id)),
  ];

  await upsertCachedUserLists(userId, merged);
  emitChange(changeTopics.userLists(userId));
}

async function fetchSavedListsForUser(userId: string, ids: string[]): Promise<void> {
  const state = userListsState.get(userId);
  if (!state) {
    return;
  }

  const seq = ++state.fetchSavedListsSeq;

  if (!ids.length) {
    state.savedLists = [];
    if (seq === state.fetchSavedListsSeq) {
      await publishUserLists(userId);
    }
    return;
  }

  try {
    const existingIds = new Set(state.ownedLists.map((list) => list.id));
    const idsToFetch = Array.from(new Set(ids)).filter((id) => !existingIds.has(id));

    if (!idsToFetch.length) {
      state.savedLists = [];
      if (seq === state.fetchSavedListsSeq) {
        await publishUserLists(userId);
      }
      return;
    }

    const hadSavedLists = state.savedLists.length > 0;
    const { lists: fetched, resolved } = await fetchSavedListsByIds(idsToFetch, listConverter);

    if (seq === state.fetchSavedListsSeq) {
      const removedFromProfile = hasRemovedSavedListIds(ids, state.savedLists, existingIds);
      if (
        shouldCommitSavedListFetch(hadSavedLists, fetched.length, resolved) ||
        removedFromProfile
      ) {
        state.savedLists = reconcileSavedLists({
          profileIds: ids,
          ownedIds: existingIds,
          previousSavedLists: state.savedLists,
          fetched,
          resolved,
        });
        await publishUserLists(userId);
      }
    }
  } catch (error) {
    logger.error('Error syncing saved lists to local store:', error);
  }
}

export function setUserSavedListIds(userId: string, savedListIds: string[]): void {
  void fetchSavedListsForUser(userId, savedListIds);
}

export function acquireUserOwnedListsSync(userId: string): () => void {
  return acquireSubscription(`sync:lists:user:${userId}`, () => {
    userListsState.set(userId, {
      ownedLists: [],
      savedLists: [],
      fetchSavedListsSeq: 0,
    });

    const listsQuery = query(
      collection(db, 'lists').withConverter(listConverter),
      or(where('ownerId', '==', userId), where('collaboratorIds', 'array-contains', userId))
    );

    return onSnapshot(
      listsQuery,
      (snapshot) => {
        void (async () => {
          const state = userListsState.get(userId);
          if (!state) {
            return;
          }

          const batch = writeBatch(db);
          let updatesNeeded = false;

          for (const change of snapshot.docChanges()) {
            if (change.type === 'removed') {
              await removeCachedList(change.doc.id);
              await removeCachedUserList(userId, change.doc.id);
              emitChange(changeTopics.list(change.doc.id));
              continue;
            }

            const list = change.doc.data();
            await upsertCachedList(list);

            const permissionUpdates = needsListPermissionSync(list);
            if (permissionUpdates) {
              batch.update(change.doc.ref, permissionUpdates);
              updatesNeeded = true;
            }

            emitChange(changeTopics.list(list.id));
          }

          if (updatesNeeded) {
            batch.commit().catch((err) => logger.error('Error in list self-healing:', err));
          }

          state.ownedLists = snapshot.docs.map((snapDoc) => snapDoc.data());
          await publishUserLists(userId);
        })();
      },
      (error) => {
        logger.error('User lists sync subscription error:', error);
      }
    );
  });
}

export function acquireListSync(listId: string): () => void {
  return acquireSubscription(`sync:list:${listId}`, () => {
    const listRef = doc(db, 'lists', listId).withConverter(listConverter);

    return onSnapshot(
      listRef,
      (docSnap) => {
        void (async () => {
          if (!docSnap.exists()) {
            await removeCachedList(listId);
            emitChange(changeTopics.list(listId));
            return;
          }

          await upsertCachedList(docSnap.data());
          emitChange(changeTopics.list(listId));
        })();
      },
      (error) => {
        logger.error('List sync subscription error:', error);
      }
    );
  });
}

export function clearUserListsSyncState(userId: string): void {
  userListsState.delete(userId);
}

export function clearAllUserListsSyncState(): void {
  userListsState.clear();
}
