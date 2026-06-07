export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  theme?: 'light' | 'dark';
  photoURL?: string;
  bio?: string;
  location?: string;
  savedLists?: string[];
  fcmTokens?: string[];
  notificationsDisabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
