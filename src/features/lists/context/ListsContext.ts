import { createContext } from 'react';
import type { PlaceList } from '@/features/lists/types/list';

export interface ListsContextValue {
  lists: PlaceList[];
  /** True when the latest lists snapshot came from Firestore local cache. */
  listsFromCache: boolean;
  loading: boolean;
  creating: boolean;
  error: string | null;
  isOfflineView: boolean;
  createList: (data: {
    name: string;
    description?: string;
    icon: string;
    color: string;
    iconSize: number;
    isPublic: boolean;
    email: string;
    username: string;
    clientId?: string;
  }) => Promise<string | undefined>;
  updateList: (listId: string, data: Partial<PlaceList>, userId?: string) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
}

export const ListsContext = createContext<ListsContextValue | null>(null);
