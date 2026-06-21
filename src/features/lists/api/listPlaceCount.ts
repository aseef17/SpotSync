import { getCountFromServer } from 'firebase/firestore';
import { buildListPlaceMembershipCountQuery } from '@/features/places/api/listPlaceMembershipFirestore';
import type { PlaceList } from '@/features/lists/types/list';
import { toPlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import { getCachedPlaceCountForList } from '@/lib/localDb/placeCache';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';

export async function resolveListPlaceCount(
  list: Pick<PlaceList, 'id' | 'ownerId' | 'isPublic'>,
  userId: string
): Promise<number> {
  const cachedCount = await getCachedPlaceCountForList(list.id);

  if (!isBrowserOnline()) {
    return cachedCount;
  }

  try {
    const access = toPlaceListAccessQuery(list.id, userId, list);
    const snapshot = await getCountFromServer(buildListPlaceMembershipCountQuery(access));
    return snapshot.data().count;
  } catch (error) {
    logger.debug('Failed to fetch list place count from server, using cache:', error);
    return cachedCount;
  }
}
