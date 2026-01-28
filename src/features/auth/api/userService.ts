import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { db } from '@/lib/firebase';
import type { User } from '@/features/auth/types/user';

export class UserService {
  static async getUser(userId: string): Promise<User | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() } as User;
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

  static async checkUsernameExists(username: string): Promise<boolean> {
    try {
      const normalizedUsername = username.toLowerCase().trim();
      const usernameDoc = await getDoc(doc(db, 'usernames', normalizedUsername));
      return usernameDoc.exists();
    } catch (error) {
      logger.error('Error checking username:', error);
      throw error;
    }
  }

  static async getUserByUsername(username: string): Promise<User | null> {
    try {
      const q = query(collection(db, 'users'), where('username', '==', username));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() } as User;
      }
      return null;
    } catch (error) {
      logger.error('Error getting user by username:', error);
      throw error;
    }
  }

  static async searchUsers(searchTerm: string): Promise<User[]> {
    try {
      // Note: This is a simple search. For production, consider using Algolia or Firebase Extensions
      const users: User[] = [];
      const q = query(collection(db, 'users'));
      const querySnapshot = await getDocs(q);

      querySnapshot.forEach((doc) => {
        const user = { id: doc.id, ...doc.data() } as User;
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
