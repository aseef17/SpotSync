import { useContext } from 'react';
import {
  PlaceDataMigrationContext,
  type PlaceDataMigrationContextValue,
} from '@/features/places/context/PlaceDataMigrationContext';

export function usePlaceDataMigration(): PlaceDataMigrationContextValue {
  return useContext(PlaceDataMigrationContext);
}
