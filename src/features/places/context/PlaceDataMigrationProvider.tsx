import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { PlaceDataMigrationContext } from '@/features/places/context/PlaceDataMigrationContext';
import { migratePlaceLocalData, needsPlaceDataMigration } from '@/lib/localDb/placeDataMigration';
import { logger } from '@/utils/logger';

export function PlaceDataMigrationProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [isMigrating, setIsMigrating] = useState(false);
  const migrationStartedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user?.id) {
      return;
    }

    if (migrationStartedForUser.current === user.id) {
      return;
    }

    if (!needsPlaceDataMigration()) {
      return;
    }

    migrationStartedForUser.current = user.id;
    let cancelled = false;

    void (async () => {
      setIsMigrating(true);
      try {
        await migratePlaceLocalData();
      } catch (error) {
        logger.error('Place local data migration failed:', error);
        migrationStartedForUser.current = null;
      } finally {
        if (!cancelled) {
          setIsMigrating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user?.id]);

  const value = useMemo(() => ({ isMigrating }), [isMigrating]);

  return (
    <PlaceDataMigrationContext.Provider value={value}>
      {children}
    </PlaceDataMigrationContext.Provider>
  );
}
