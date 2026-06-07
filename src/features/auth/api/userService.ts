import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  DocumentData,
} from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { db } from '@/lib/firebase';
import type { User } from '@/features/auth/types/user';
import { omit } from '@/utils/objectUtils';
import { checkUsernameExistsRemote } from '@/features/auth/api/accountService';
import {
  getCachedUser,
  getPendingMutations,
  patchCachedUser,
  queueOfflineMutation,
  removeCachedUserList,
  upsertCachedUser,
  applyPendingMutationsToUser,
} from '@/lib/localDb';

const userConverter: FirestoreDataConverter<User> = {
  toFirestore(user: User): DocumentData {
    return omit(user, ['id']);
  },
  fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): User {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      email: data.email || '',
      displayName: data.displayName || '',
      username: data.username || '',
      photoURL: data.photoURL,
      bio: data.bio,
      location: data.location,
      savedLists: data.savedLists || [],
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    } as User;
  },
};

export class UserService {
  static async getUser(userId: string): Promise<User | null> {
    try {
      const cached = await getCachedUser(userId);
      if (cached) {
        const pendingMutations = await getPendingMutations();
        return applyPendingMutationsToUser(cached, pendingMutations);
      }

      const userDoc = await getDoc(doc(db, 'users', userId).withConverter(userConverter));
      if (!userDoc.exists()) {
        return null;
      }

      const user = userDoc.data();
      void upsertCachedUser(user);
      const pendingMutations = await getPendingMutations();
      return applyPendingMutationsToUser(user, pendingMutations);
    } catch (error) {
      logger.error('Error getting user:', error);
      throw error;
    }
  }

  static async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    try {
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      await queueOfflineMutation(
        'updateUser',
        userId,
        { userId, updates: updateData },
        async () => {
          await patchCachedUser(userId, updateData);
        }
      );
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  static async updateProfileWithUsername(
    userId: string,
    updates: { displayName: string; username: string },
    oldUsername?: string
  ): Promise<void> {
    const normalizedNewUsername = updates.username.toLowerCase().trim();
    const normalizedOldUsername = oldUsername?.toLowerCase().trim();
    const usernameChanged =
      normalizedOldUsername !== undefined && normalizedNewUsername !== normalizedOldUsername;

    if (!usernameChanged) {
      await this.updateUser(userId, {
        displayName: updates.displayName,
        username: normalizedNewUsername,
      });
      return;
    }

    await queueOfflineMutation(
      'updateProfile',
      userId,
      {
        userId,
        displayName: updates.displayName,
        username: normalizedNewUsername,
        oldUsername: normalizedOldUsername,
      },
      async () => {
        await patchCachedUser(userId, {
          displayName: updates.displayName,
          username: normalizedNewUsername,
          updatedAt: new Date(),
        });
      }
    );
  }

  static async checkUsernameExists(username: string): Promise<boolean> {
    try {
      const normalizedUsername = username.toLowerCase().trim();

      const usernameDoc = await getDoc(doc(db, 'usernames', normalizedUsername));
      if (usernameDoc.exists()) return true;

      return await checkUsernameExistsRemote(normalizedUsername);
    } catch (error) {
      logger.error('Error checking username:', error);
      throw error;
    }
  }

  static async getUserByUsername(username: string): Promise<User | null> {
    try {
      const q = query(
        collection(db, 'users').withConverter(userConverter),
        where('username', '==', username)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].data();
      }
      return null;
    } catch (error) {
      logger.error('Error getting user by username:', error);
      throw error;
    }
  }

  static async saveListToProfile(userId: string, listId: string): Promise<void> {
    try {
      await queueOfflineMutation(
        'saveListToProfile',
        `${userId}:${listId}`,
        { userId, listId },
        async () => {
          const user = await getCachedUser(userId);
          const savedLists = user?.savedLists ?? [];
          if (user && !savedLists.includes(listId)) {
            await patchCachedUser(userId, {
              savedLists: [...savedLists, listId],
              updatedAt: new Date(),
            });
          }
        }
      );
    } catch (error) {
      logger.error('Error saving list to profile:', error);
      throw error;
    }
  }

  static async removeListFromProfile(userId: string, listId: string): Promise<void> {
    try {
      await queueOfflineMutation(
        'removeListFromProfile',
        `${userId}:${listId}`,
        { userId, listId },
        async () => {
          const user = await getCachedUser(userId);
          if (user) {
            const savedLists = user.savedLists ?? [];
            await patchCachedUser(userId, {
              savedLists: savedLists.filter((id) => id !== listId),
              updatedAt: new Date(),
            });
          }
          await removeCachedUserList(userId, listId);
        }
      );
    } catch (error) {
      logger.error('Error removing list from profile:', error);
      throw error;
    }
  }

  static async searchUsers(searchTerm: string): Promise<User[]> {
    try {
      const users: User[] = [];
      const q = query(collection(db, 'users').withConverter(userConverter));
      const querySnapshot = await getDocs(q);

      querySnapshot.forEach((doc) => {
        const user = doc.data();
        if (
          user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          users.push(user);
        }
      });

      return users;
    } catch (error) {
      logger.error('Error searching users:', error);
      throw error;
    }
  }
}
