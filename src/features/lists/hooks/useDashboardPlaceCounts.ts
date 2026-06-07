import { useEffect, useMemo, useState } from 'react';
import { resolveListPlaceCount } from '@/features/lists/api/listPlaceCount';
import { changeTopics, subscribeToChanges } from '@/lib/localDb/changeBus';

export function useDashboardPlaceCounts(listIds: string[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const listIdsKey = useMemo(() => listIds.join(','), [listIds]);

  useEffect(() => {
    if (listIds.length === 0) {
      return;
    }

    let cancelled = false;

    const refreshCounts = async () => {
      const entries = await Promise.all(
        listIds.map(async (listId) => [listId, await resolveListPlaceCount(listId)] as const)
      );

      if (!cancelled) {
        setCounts(Object.fromEntries(entries));
      }
    };

    void refreshCounts();

    const unsubscribePlaceChanges = listIds.map((listId) =>
      subscribeToChanges(changeTopics.placesForList(listId), () => {
        void resolveListPlaceCount(listId).then((count) => {
          if (cancelled) {
            return;
          }
          setCounts((previous) =>
            previous[listId] === count ? previous : { ...previous, [listId]: count }
          );
        });
      })
    );

    return () => {
      cancelled = true;
      unsubscribePlaceChanges.forEach((unsubscribe) => unsubscribe());
    };
  }, [listIds, listIdsKey]);

  if (listIds.length === 0) {
    return {};
  }

  return counts;
}
