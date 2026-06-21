import { useEffect, useMemo, useState } from 'react';
import { resolveListPlaceCount } from '@/features/lists/api/listPlaceCount';
import type { PlaceList } from '@/features/lists/types/list';
import { changeTopics, subscribeToChanges } from '@/lib/localDb/changeBus';

export function useDashboardPlaceCounts(
  userId: string | undefined,
  lists: Array<Pick<PlaceList, 'id' | 'ownerId' | 'isPublic' | 'places'>>
): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const listsKey = useMemo(
    () => lists.map((list) => `${list.id}:${list.ownerId}:${list.isPublic === true}`).join(','),
    [lists]
  );

  useEffect(() => {
    if (!userId || lists.length === 0) {
      return;
    }

    let cancelled = false;

    const refreshCounts = async () => {
      const entries = await Promise.all(
        lists.map(async (list) => [list.id, await resolveListPlaceCount(list, userId)] as const)
      );

      if (!cancelled) {
        setCounts(Object.fromEntries(entries));
      }
    };

    void refreshCounts();

    const unsubscribePlaceChanges = lists.map((list) =>
      subscribeToChanges(changeTopics.placesForList(list.id), () => {
        void resolveListPlaceCount(list, userId).then((count) => {
          if (cancelled) {
            return;
          }
          setCounts((previous) =>
            previous[list.id] === count ? previous : { ...previous, [list.id]: count }
          );
        });
      })
    );

    return () => {
      cancelled = true;
      unsubscribePlaceChanges.forEach((unsubscribe) => unsubscribe());
    };
  }, [userId, lists, listsKey]);

  if (!userId || lists.length === 0) {
    return {};
  }

  return counts;
}
