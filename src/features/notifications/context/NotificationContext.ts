import { createContext } from 'react';

export interface NotificationContextType {
  permissionGranted: boolean;
  tokenSynced: boolean;
  notificationsDisabled: boolean;
  requestPermission: () => Promise<boolean>;
  disableNotifications: () => Promise<void>;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
