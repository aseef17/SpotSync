import React from 'react';
import { Loader2 } from 'lucide-react';
import { usePlaceDataMigration } from '@/features/places/context/PlaceDataMigrationContext';

export const PlaceDataMigrationBanner: React.FunctionComponent = () => {
  const { isMigrating } = usePlaceDataMigration();

  if (!isMigrating) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full shrink-0 border-b border-sky-200/80 bg-sky-50 px-4 py-2.5 dark:border-sky-900/60 dark:bg-sky-950"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2.5">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-700 dark:text-sky-300" />
        <p className="text-sm font-medium text-sky-900 dark:text-sky-100">
          Updating your places for the latest sync format. This runs once per device.
        </p>
      </div>
    </div>
  );
};
