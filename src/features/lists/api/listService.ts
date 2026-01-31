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
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PlaceList, Collaborator, Permission } from '@/features/lists/types/list';
import { logger } from '@/utils/logger';
import { toMilliseconds } from '@/utils/date';

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
        clientId,
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
      const listDoc = await getDoc(doc(db, 'lists', listId));
      if (listDoc.exists()) {
        const data = listDoc.data();
        return { id: listDoc.id, ...data } as PlaceList;
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
      const q = query(
        collection(db, 'lists'),
        or(where('ownerId', '==', userId), where('collaboratorIds', 'array-contains', userId))
      );

      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      let updatesNeeded = false;

      snapshot.forEach((snapDoc) => {
        const data = snapDoc.data() as PlaceList;
        const list = { ...data, id: snapDoc.id };
        lists.push(list);

        // Self-healing: Ensure collaboratorIds includes owner
        const expectedIds = Array.from(
          new Set([data.ownerId, ...(data.collaborators?.map((c) => c.userId) || [])])
        );

        if (!data.collaboratorIds || data.collaboratorIds.length !== expectedIds.length) {
          batch.update(snapDoc.ref, { collaboratorIds: expectedIds });
          updatesNeeded = true;
        }
      });

      if (updatesNeeded) {
        batch.commit().catch((err) => logger.error('Error in list self-healing:', err));
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
        collection(db, 'lists'),
        where('isPublic', '==', true),
        orderBy('updatedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
        } as PlaceList;
      });
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

      await updateDoc(doc(db, 'lists', listId), {
        collaborators: arrayUnion(collaborator),
        collaboratorIds: arrayUnion(userId),
        updatedAt: new Date(),
      });
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

      await updateDoc(doc(db, 'lists', listId), {
        collaborators: updatedCollaborators,
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Error updating collaborator permission:', error);
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
}
