export interface Invitation {
  id: string;
  listId: string;
  listName: string;
  invitedBy: string;
  invitedByUsername: string;
  invitedEmail?: string;
  invitedUsername?: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
}
