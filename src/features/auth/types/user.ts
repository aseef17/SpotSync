export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  theme?: 'light' | 'dark';
  createdAt: Date;
  updatedAt: Date;
}
