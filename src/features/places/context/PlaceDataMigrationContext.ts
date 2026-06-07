import { createContext } from 'react';

export interface PlaceDataMigrationContextValue {
  isMigrating: boolean;
}

export const PlaceDataMigrationContext = createContext<PlaceDataMigrationContextValue>({
  isMigrating: false,
});
