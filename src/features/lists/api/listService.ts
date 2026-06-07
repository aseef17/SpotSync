import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  or,
  orderBy,
  getDocs,
  arrayUnion,
  arrayRemove,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PlaceList, Collaborator, Permission } from '@/features/lists/types/list';
import { logger } from '@/utils/logger';
import { toMilliseconds } from '@/utils/date';
import { omit } from '@/utils/objectUtils';

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

export const listConverter: FirestoreDataConverter<PlaceList> = {
  toFirestore(list: PlaceList): DocumentData {
    return omit(list, ['id']);
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): PlaceList {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    } as PlaceList;
  },
};

export class ListService {
  static async createList(
    ownerId: string,
    name: string,
    description?: string,
    icon?: string,
    color?: string,
    iconSize?: number,
    isPublic: boolean = false,
    ownerEmail?: string,
    ownerUsername?: string,
    clientId?: string
  ): Promise<string> {
    try {
      const listRef = doc(collection(db, 'lists'));
      const newList: Omit<PlaceList, 'id'> = {
        name,
        isPublic,
        ownerId,
        collaborators: [
          {
            userId: ownerId,
            username: ownerUsername || '',
            email: ownerEmail || '',
            permission: 'owner',
            invitedAt: new Date(),
            joinedAt: new Date(),
          },
        ],
        collaboratorIds: [ownerId],
        editorIds: [ownerId],
        places: [],
        customStatuses: [],
        tags: [],
        icon: icon || 'AUTO',
        color: color || 'Blue',
        iconSize: iconSize || 36,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: ownerId,
        updatedBy: ownerId,
        ...(clientId ? { clientId } : {}),
      };

      // Only add description if it's provided and not empty
      if (description && description.trim()) {
        newList.description = description.trim();
      }

      await setDoc(listRef, newList);
      return listRef.id;
    } catch (error) {
      logger.error('Error creating list:', error);
      throw error;
    }
  }

  static async getList(listId: string): Promise<PlaceList | null> {
    try {
      const listDoc = await getDoc(doc(db, 'lists', listId).withConverter(listConverter));
      if (listDoc.exists()) {
        return listDoc.data();
      }
      return null;
    } catch (error) {
      logger.error('Error getting list:', error);
      throw error;
    }
  }

  static async getUserLists(userId: string): Promise<PlaceList[]> {
    try {
      const lists: PlaceList[] = [];

      // Get all lists where user is owner OR collaborator in a single query
      // This will automatically find legacy lists (via ownerId) and shared lists (via collaboratorIds)
      const { UserService } = await import('@/features/auth/api/userService');
      const user = await UserService.getUser(userId);

      const q = query(
        collection(db, 'lists').withConverter(listConverter),
        or(where('ownerId', '==', userId), where('collaboratorIds', 'array-contains', userId))
      );

      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      let updatesNeeded = false;

      snapshot.forEach((snapDoc) => {
        const data = snapDoc.data();
        const list = { ...data };
        lists.push(list);

        const permissionUpdates = needsListPermissionSync(data);
        if (permissionUpdates) {
          batch.update(snapDoc.ref, permissionUpdates);
          updatesNeeded = true;
        }
      });

      if (updatesNeeded) {
        batch.commit().catch((err) => logger.error('Error in list self-healing:', err));
      }

      // Fetch saved lists
      if (user?.savedLists && user.savedLists.length > 0) {
        const { documentId } = await import('firebase/firestore');
        const uniqueIds = Array.from(new Set(user.savedLists));
        // Remove ids we already fetched
        const existingIds = new Set(lists.map((l) => l.id));
        const idsToFetch = uniqueIds.filter((id) => !existingIds.has(id));

        if (idsToFetch.length > 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < idsToFetch.length; i += 10) {
            chunks.push(idsToFetch.slice(i, i + 10));
          }

          for (const chunk of chunks) {
            const savedQuery = query(
              collection(db, 'lists').withConverter(listConverter),
              where(documentId(), 'in', chunk)
            );
            const savedSnap = await getDocs(savedQuery);
            savedSnap.forEach((docSnap) => {
              lists.push({ ...docSnap.data(), isSavedList: true } as PlaceList & {
                isSavedList: boolean;
              });
            });
          }
        }
      }

      // Sort client-side by updatedAt descending
      return lists.sort((a, b) => toMilliseconds(b.updatedAt) - toMilliseconds(a.updatedAt));
    } catch (error) {
      logger.error('Error getting user lists:', error);
      throw error;
    }
  }

  static async getPublicLists(): Promise<PlaceList[]> {
    try {
      const q = query(
        collection(db, 'lists').withConverter(listConverter),
        where('isPublic', '==', true),
        orderBy('updatedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) => doc.data());
    } catch (error) {
      logger.error('Error getting public lists:', error);
      throw error;
    }
  }

  static async updateList(
    listId: string,
    updates: Partial<PlaceList>,
    userId?: string
  ): Promise<void> {
    try {
      const updateData: Partial<PlaceList> & { updatedAt: Date; updatedBy?: string } = {
        ...updates,
        updatedAt: new Date(),
      };

      if (userId) {
        updateData.updatedBy = userId;
      }

      await updateDoc(doc(db, 'lists', listId), updateData);
    } catch (error) {
      logger.error('Error updating list:', error);
      throw error;
    }
  }

  static async deleteList(listId: string): Promise<void> {
    try {
      // 1. Find all places in the list
      const placesQuery = query(collection(db, 'places'), where('listId', '==', listId));
      const placesSnapshot = await getDocs(placesQuery);

      const places = placesSnapshot.docs;

      if (places.length === 0) {
        await deleteDoc(doc(db, 'lists', listId));
        return;
      }

      const BATCH_SIZE = 499;

      for (let i = 0; i < places.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = places.slice(i, i + BATCH_SIZE);

        chunk.forEach((placeDoc) => {
          batch.delete(placeDoc.ref);
        });

        // If this is the last chunk, OR the only chunk, include the list deletion in this batch
        if (i + BATCH_SIZE >= places.length) {
          batch.delete(doc(db, 'lists', listId));
        }

        await batch.commit();
      }
    } catch (error) {
      logger.error('Error deleting list:', error);
      throw error;
    }
  }

  static async addCollaborator(
    listId: string,
    userId: string,
    username: string,
    email: string,
    permission: Permission
  ): Promise<void> {
    try {
      const collaborator: Collaborator = {
        userId,
        username,
        email,
        permission,
        invitedAt: new Date(),
      };

      const listUpdates: Record<string, unknown> = {
        collaborators: arrayUnion(collaborator),
        collaboratorIds: arrayUnion(userId),
        updatedAt: new Date(),
      };
      if (permission === 'editor' || permission === 'owner') {
        listUpdates.editorIds = arrayUnion(userId);
      }
      await updateDoc(doc(db, 'lists', listId), listUpdates);
    } catch (error) {
      logger.error('Error adding collaborator:', error);
      throw error;
    }
  }

  static async removeCollaborator(listId: string, userId: string): Promise<void> {
    try {
      const list = await this.getList(listId);
      if (!list) throw new Error('List not found');

      const collaboratorToRemove = list.collaborators.find((c) => c.userId === userId);
      if (!collaboratorToRemove) throw new Error('Collaborator not found');

      await updateDoc(doc(db, 'lists', listId), {
        collaborators: arrayRemove(collaboratorToRemove),
        collaboratorIds: arrayRemove(userId),
        editorIds: arrayRemove(userId),
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Error removing collaborator:', error);
      throw error;
    }
  }

  static async updateCollaboratorPermission(
    listId: string,
    userId: string,
    permission: Permission
  ): Promise<void> {
    try {
      const list = await this.getList(listId);
      if (!list) throw new Error('List not found');

      const updatedCollaborators = list.collaborators.map((c) =>
        c.userId === userId ? { ...c, permission } : c
      );
      const editorIds = getExpectedEditorIds({ ...list, collaborators: updatedCollaborators });

      await updateDoc(doc(db, 'lists', listId), {
        collaborators: updatedCollaborators,
        editorIds,
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Error updating collaborator permission:', error);
      throw error;
    }
  }

  static async savePublicList(listId: string, userId: string): Promise<void> {
    try {
      const { UserService } = await import('@/features/auth/api/userService');
      await UserService.saveListToProfile(userId, listId);
    } catch (error) {
      logger.error('Error saving public list:', error);
      throw error;
    }
  }

  static async unsavePublicList(listId: string, userId: string): Promise<void> {
    try {
      const { UserService } = await import('@/features/auth/api/userService');
      await UserService.removeListFromProfile(userId, listId);
    } catch (error) {
      logger.error('Error unsaving public list:', error);
      throw error;
    }
  }

  static async addCustomStatus(listId: string, status: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'lists', listId), {
        customStatuses: arrayUnion(status),
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Error adding custom status:', error);
      throw error;
    }
  }

  static async removeCustomStatus(listId: string, status: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'lists', listId), {
        customStatuses: arrayRemove(status),
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Error removing custom status:', error);
      throw error;
    }
  }

  static subscribeToUserLists(
    userId: string,
    onUpdate: (lists: PlaceList[]) => void,
    onError: (error: Error) => void
  ): () => void {
    let ownedLists: PlaceList[] = [];
    let savedLists: PlaceList[] = [];
    let savedListIds: string[] = [];
    let fetchSavedListsSeq = 0;

    const emit = () => {
      const existingIds = new Set(ownedLists.map((list) => list.id));
      const merged = [...ownedLists, ...savedLists.filter((list) => !existingIds.has(list.id))];
      merged.sort((a, b) => toMilliseconds(b.updatedAt) - toMilliseconds(a.updatedAt));
      onUpdate(merged);
    };

    const fetchSavedLists = async (ids: string[]) => {
      const seq = ++fetchSavedListsSeq;

      if (!ids.length) {
        savedLists = [];
        if (seq === fetchSavedListsSeq) {
          emit();
        }
        return;
      }

      try {
        const existingIds = new Set(ownedLists.map((list) => list.id));
        const idsToFetch = Array.from(new Set(ids)).filter((id) => !existingIds.has(id));

        if (!idsToFetch.length) {
          savedLists = [];
          if (seq === fetchSavedListsSeq) {
            emit();
          }
          return;
        }

        const fetched: PlaceList[] = [];
        const { documentId } = await import('firebase/firestore');

        for (let i = 0; i < idsToFetch.length; i += 10) {
          const chunk = idsToFetch.slice(i, i + 10);
          const savedQuery = query(
            collection(db, 'lists').withConverter(listConverter),
            where(documentId(), 'in', chunk)
          );
          const savedSnap = await getDocs(savedQuery);
          savedSnap.forEach((docSnap) => {
            fetched.push({ ...docSnap.data(), isSavedList: true } as PlaceList);
          });
        }

        if (seq === fetchSavedListsSeq) {
          savedLists = fetched;
          emit();
        }
      } catch (err) {
        logger.error('Error fetching saved lists:', err);
        onError(err instanceof Error ? err : new Error('Failed to fetch saved lists'));
      }
    };

    const listsQuery = query(
      collection(db, 'lists').withConverter(listConverter),
      or(where('ownerId', '==', userId), where('collaboratorIds', 'array-contains', userId))
    );

    const unsubscribeLists = onSnapshot(
      listsQuery,
      (snapshot) => {
        const lists: PlaceList[] = [];
        const batch = writeBatch(db);
        let updatesNeeded = false;

        snapshot.forEach((snapDoc) => {
          const data = snapDoc.data();
          lists.push({ ...data });

          const permissionUpdates = needsListPermissionSync(data);
          if (permissionUpdates) {
            batch.update(snapDoc.ref, permissionUpdates);
            updatesNeeded = true;
          }
        });

        if (updatesNeeded) {
          batch.commit().catch((err) => logger.error('Error in list self-healing:', err));
        }

        ownedLists = lists;
        emit();
        void fetchSavedLists(savedListIds);
      },
      (err) => {
        logger.error('Error subscribing to user lists:', err);
        onError(err);
      }
    );

    const unsubscribeUser = onSnapshot(
      doc(db, 'users', userId),
      (userSnap) => {
        savedListIds = (userSnap.data()?.savedLists as string[] | undefined) || [];
        void fetchSavedLists(savedListIds);
      },
      (err) => {
        logger.error('Error subscribing to saved lists:', err);
        onError(err);
      }
    );

    return () => {
      unsubscribeLists();
      unsubscribeUser();
    };
  }

  static subscribeToList(
    listId: string,
    onUpdate: (list: PlaceList | null) => void,
    onError: (error: Error) => void
  ): () => void {
    const listRef = doc(db, 'lists', listId).withConverter(listConverter);
    return onSnapshot(
      listRef,
      (docSnap) => {
        if (docSnap.exists()) {
          onUpdate(docSnap.data());
        } else {
          onUpdate(null);
        }
      },
      (err) => {
        logger.error('Error subscribing to list:', err);
        onError(err);
      }
    );
  }
}
