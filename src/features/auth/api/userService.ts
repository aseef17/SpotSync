import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
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
      const userDoc = await getDoc(doc(db, 'users', userId).withConverter(userConverter));
      if (userDoc.exists()) {
        return userDoc.data();
      }
      return null;
    } catch (error) {
      logger.error('Error getting user:', error);
      throw error;
    }
  }

  static async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    try {
      await updateDoc(doc(db, 'users', userId), {
        ...updates,
        updatedAt: new Date(),
      });
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

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        const userDoc = await transaction.get(userRef);
        const currentUsername = (userDoc.data() as User | undefined)?.username
          ?.toLowerCase()
          .trim();

        const newUsernameRef = doc(db, 'usernames', normalizedNewUsername);
        const newUsernameDoc = await transaction.get(newUsernameRef);

        if (newUsernameDoc.exists()) {
          throw new Error('Username is not available');
        }

        const usernameToRelease = currentUsername || normalizedOldUsername;
        if (usernameToRelease && usernameToRelease !== normalizedNewUsername) {
          transaction.delete(doc(db, 'usernames', usernameToRelease));
        }
        transaction.set(newUsernameRef, { uid: userId });

        transaction.update(userRef, {
          displayName: updates.displayName,
          username: normalizedNewUsername,
          updatedAt: new Date(),
        });
      });
    } catch (error) {
      logger.error('Error updating profile:', error);
      throw error;
    }
  }

  static async checkUsernameExists(username: string): Promise<boolean> {
    try {
      const normalizedUsername = username.toLowerCase().trim();

      // Check usernames collection
      const usernameDoc = await getDoc(doc(db, 'usernames', normalizedUsername));
      if (usernameDoc.exists()) return true;

      // Fallback: Check users collection directly for older accounts
      try {
        const q = query(
          collection(db, 'users'),
          where('username', '==', normalizedUsername) // Note: might not be case-insensitive in Firestore, but works for exact matches
        );
        const querySnapshot = await getDocs(q);

        // Also try case-sensitive check on actual username if different
        if (querySnapshot.empty && username !== normalizedUsername) {
          const qOriginal = query(collection(db, 'users'), where('username', '==', username));
          const qOriginalSnap = await getDocs(qOriginal);
          if (!qOriginalSnap.empty) return true;
        }

        return !querySnapshot.empty;
      } catch (fallbackError) {
        // If the user isn't authenticated, reading the 'users' collection will throw a permission error.
        // In that case, we rely purely on the 'usernames' collection (which we checked above) being accurate.
        const error = fallbackError as { code?: string };
        if (error?.code === 'permission-denied') {
          return false;
        }
        throw fallbackError;
      }
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
      const { arrayUnion } = await import('firebase/firestore');
      await updateDoc(doc(db, 'users', userId), {
        savedLists: arrayUnion(listId),
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Error saving list to profile:', error);
      throw error;
    }
  }

  static async removeListFromProfile(userId: string, listId: string): Promise<void> {
    try {
      const { arrayRemove } = await import('firebase/firestore');
      await updateDoc(doc(db, 'users', userId), {
        savedLists: arrayRemove(listId),
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Error removing list from profile:', error);
      throw error;
    }
  }

  static async searchUsers(searchTerm: string): Promise<User[]> {
    try {
      // TODO: Implement full-text search using Algolia or Firebase Extensions
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
