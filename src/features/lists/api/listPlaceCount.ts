import { getCountFromServer } from 'firebase/firestore';
import { buildListPlaceMembershipsQuery } from '@/features/places/api/listPlaceMembershipFirestore';
import { getCachedPlaceCountForList } from '@/lib/localDb/placeCache';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';

export async function resolveListPlaceCount(listId: string): Promise<number> {
  const cachedCount = await getCachedPlaceCountForList(listId);

  if (!isBrowserOnline()) {
    return cachedCount;
  }

  try {
    const snapshot = await getCountFromServer(buildListPlaceMembershipsQuery(listId));
    return snapshot.data().count;
  } catch (error) {
    logger.debug('Failed to fetch list place count from server, using cache:', error);
    return cachedCount;
  }
}
