import { collection, getDocs, query, where, type FirestoreDataConverter } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';
import { getCachedList, upsertCachedList } from '@/lib/localDb';
import type { PlaceList } from '@/features/lists/types/list';

export async function fetchSavedListsByIds(
  idsToFetch: string[],
  listConverter: FirestoreDataConverter<PlaceList>
): Promise<{ lists: PlaceList[]; resolved: boolean }> {
  if (!idsToFetch.length) {
    return { lists: [], resolved: true };
  }

  if (!isBrowserOnline()) {
    const fetched: PlaceList[] = [];
    for (const listId of idsToFetch) {
      const cached = await getCachedList(listId);
      if (cached) {
        fetched.push({ ...cached, isSavedList: true } as PlaceList);
      }
    }
    return { lists: fetched, resolved: fetched.length === idsToFetch.length };
  }

  const fetched: PlaceList[] = [];
  let allChunksResolved = true;
  const { documentId } = await import('firebase/firestore');

  for (let i = 0; i < idsToFetch.length; i += 10) {
    const chunk = idsToFetch.slice(i, i + 10);
    const savedQuery = query(
      collection(db, 'lists').withConverter(listConverter),
      where(documentId(), 'in', chunk)
    );

    let chunkResolved = false;
    try {
      const savedSnap = await getDocs(savedQuery);
      chunkResolved = true;
      savedSnap.forEach((docSnap) => {
        const list = { ...docSnap.data(), isSavedList: true } as PlaceList;
        fetched.push(list);
        void upsertCachedList(list);
      });
    } catch (networkError) {
      logger.error('Error fetching saved lists:', networkError);
      let foundInChunk = 0;
      for (const listId of chunk) {
        const cached = await getCachedList(listId);
        if (cached) {
          fetched.push({ ...cached, isSavedList: true } as PlaceList);
          foundInChunk += 1;
        }
      }
      chunkResolved = foundInChunk === chunk.length;
    }

    if (!chunkResolved) {
      allChunksResolved = false;
    }
  }

  return { lists: fetched, resolved: allChunksResolved };
}

/** Commit fetch results when complete, or on first load when partial data beats showing none. */
export function shouldCommitSavedListFetch(
  hadSavedLists: boolean,
  fetchedCount: number,
  resolved: boolean
): boolean {
  return resolved || (!hadSavedLists && fetchedCount > 0);
}
