import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  getDocFromServer,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  queueOfflineMutation,
  removeCachedList,
  removeCachedPlacesForList,
  removeCachedUserListMembership,
  upsertCachedList,
  upsertCachedUserLists,
} from '@/lib/localDb';
import { listRepository } from '@/lib/localDb/repositories/listRepository';
import type { PlaceList, Collaborator, Permission } from '@/features/lists/types/list';
import { logger } from '@/utils/logger';
import { getPlaceListAccessFields } from '@/features/places/utils/placeAccess';
import { listConverter } from '@/features/lists/api/listFirestore';

function getExpectedEditorIds(list: PlaceList): string[] {
  return Array.from(
    new Set(
      (list.collaborators || [])
        .filter((c) => c.permission === 'owner' || c.permission === 'editor')
        .map((c) => c.userId)
    )
  );
}

export { listConverter };

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

      const listId = listRef.id;
      const listWithId: PlaceList = { ...newList, id: listId };

      await queueOfflineMutation('createList', listId, { listId, list: listWithId }, async () => {
        await upsertCachedList(listWithId);
        await upsertCachedUserLists(ownerId, [listWithId]);
      });

      return listId;
    } catch (error) {
      logger.error('Error creating list:', error);
      throw error;
    }
  }

  static async getListFromServer(listId: string): Promise<PlaceList | null> {
    try {
      const listDoc = await getDocFromServer(doc(db, 'lists', listId).withConverter(listConverter));
      if (listDoc.exists()) {
        return listDoc.data();
      }
      return null;
    } catch (error) {
      logger.error('Error getting list from server:', error);
      throw error;
    }
  }

  static async beginBulkImport(listId: string, userId?: string): Promise<void> {
    await this.updateList(listId, { importInProgress: true }, userId);
  }

  static async completeBulkImport(
    listId: string,
    importCount: number,
    userId?: string
  ): Promise<void> {
    await this.updateList(
      listId,
      {
        importInProgress: false,
        lastImportCount: importCount,
      },
      userId
    );
  }

  static async syncPlaceAccessFields(listId: string): Promise<void> {
    try {
      const list = await listRepository.getById(listId);
      if (!list) return;

      const accessFields = getPlaceListAccessFields(list);
      const placesQuery = query(collection(db, 'places'), where('listId', '==', listId));
      const placesSnapshot = await getDocs(placesQuery);
      if (placesSnapshot.empty) return;

      const BATCH_SIZE = 500;
      const docs = placesSnapshot.docs;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        docs.slice(i, i + BATCH_SIZE).forEach((placeDoc) => {
          batch.update(placeDoc.ref, { ...accessFields });
        });
        await batch.commit();
      }
    } catch (error) {
      logger.error('Error syncing place access fields:', error);
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

      await queueOfflineMutation(
        'updateList',
        listId,
        { listId, updates: updateData },
        async () => {
          const cached = await listRepository.getById(listId);
          if (cached) {
            await upsertCachedList({ ...cached, ...updateData });
          }
        }
      );
    } catch (error) {
      logger.error('Error updating list:', error);
      throw error;
    }
  }

  static async deleteList(listId: string, _userId?: string): Promise<void> {
    try {
      await queueOfflineMutation('deleteList', listId, { listId }, async () => {
        await removeCachedPlacesForList(listId);
        await removeCachedList(listId);
        await removeCachedUserListMembership(listId);
      });
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
      const list = await listRepository.getById(listId);
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
      const list = await listRepository.getById(listId);
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
}
