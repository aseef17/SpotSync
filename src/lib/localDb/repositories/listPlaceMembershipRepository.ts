import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import type { PlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import {
  fetchListPlaceMembershipById,
  fetchListPlaceMembershipByListAndGooglePlaceId,
  fetchListPlaceMembershipsForList,
} from '@/lib/localDb/sync/listPlaceMembershipFetch';
import { acquireListPlaceMembershipsSync } from '@/lib/localDb/sync/listPlaceMembershipSync';

export interface SubscribeToListPlaceMembershipsOptions {
  enableSync?: boolean;
}

export const listPlaceMembershipRepository = {
  async getById(membershipId: string): Promise<ListPlaceMembership | null> {
    return fetchListPlaceMembershipById(membershipId);
  },

  async getForList(listId: string): Promise<ListPlaceMembership[]> {
    return fetchListPlaceMembershipsForList(listId);
  },

  async findByListAndGooglePlaceId(
    listId: string,
    googlePlaceId: string
  ): Promise<ListPlaceMembership | null> {
    return fetchListPlaceMembershipByListAndGooglePlaceId(listId, googlePlaceId);
  },

  subscribeToListMemberships(
    access: PlaceListAccessQuery,
    onUpdate: (memberships: ListPlaceMembership[]) => void,
    onError: (error: Error) => void,
    options?: SubscribeToListPlaceMembershipsOptions
  ): () => void {
    const enableSync = options?.enableSync !== false;

    if (!enableSync) {
      void fetchListPlaceMembershipsForList(access.listId)
        .then(onUpdate)
        .catch((error) => {
          onError(
            error instanceof Error ? error : new Error('Failed to read list place memberships')
          );
        });
      return () => {};
    }

    return acquireListPlaceMembershipsSync(access, onUpdate, onError);
  },
};
