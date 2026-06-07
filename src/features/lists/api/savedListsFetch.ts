import {
  collection,
  getDocs,
  getDocsFromCache,
  query,
  where,
  type FirestoreDataConverter,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';
import type { PlaceList } from '@/features/lists/types/list';

export async function fetchSavedListsByIds(
  idsToFetch: string[],
  listConverter: FirestoreDataConverter<PlaceList>
): Promise<{ lists: PlaceList[]; resolved: boolean }> {
  if (!idsToFetch.length) {
    return { lists: [], resolved: true };
  }

  const fetched: PlaceList[] = [];
  let resolved = false;
  const { documentId } = await import('firebase/firestore');

  for (let i = 0; i < idsToFetch.length; i += 10) {
    const chunk = idsToFetch.slice(i, i + 10);
    const savedQuery = query(
      collection(db, 'lists').withConverter(listConverter),
      where(documentId(), 'in', chunk)
    );

    try {
      const savedSnap = isBrowserOnline()
        ? await getDocs(savedQuery)
        : await getDocsFromCache(savedQuery);
      resolved = true;
      savedSnap.forEach((docSnap) => {
        fetched.push({ ...docSnap.data(), isSavedList: true } as PlaceList);
      });
    } catch (networkError) {
      logger.error('Error fetching saved lists:', networkError);
      try {
        const cachedSnap = await getDocsFromCache(savedQuery);
        resolved = true;
        cachedSnap.forEach((docSnap) => {
          fetched.push({ ...docSnap.data(), isSavedList: true } as PlaceList);
        });
      } catch (cacheError) {
        logger.error('Error fetching saved lists from cache:', cacheError);
      }
    }
  }

  return { lists: fetched, resolved };
}
