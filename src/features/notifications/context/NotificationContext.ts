import { createContext } from 'react';

export interface NotificationContextType {
    permissionGranted: boolean;
    tokenSynced: boolean;
    requestPermission: () => Promise<boolean>;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
