import { ListService } from '@/features/lists/api/listService';
import { isBrowserOnline } from '@/hooks/useNetworkStatus';
import { listRepository } from '@/lib/localDb/repositories/listRepository';
import {
  getPlaceListAccessFields,
  type PlaceListAccessFields,
} from '@/features/places/utils/placeAccess';

/** Reads list access metadata from Firestore before direct membership writes. */
export async function fetchListAccessFieldsForWrite(
  listId: string
): Promise<PlaceListAccessFields> {
  if (isBrowserOnline()) {
    const serverList = await ListService.getListFromServer(listId);
    if (!serverList) {
      throw new Error('List not found');
    }

    return getPlaceListAccessFields(serverList);
  }

  const cachedList = await listRepository.getById(listId);
  if (!cachedList) {
    throw new Error('List not found');
  }

  return getPlaceListAccessFields(cachedList);
}
