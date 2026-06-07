import type { GooglePlace } from '@/features/places/types/googlePlace';
import { fetchGooglePlaceById, fetchGooglePlacesByIds } from '@/lib/localDb/sync/googlePlaceFetch';

export const googlePlaceRepository = {
  async getById(googlePlaceId: string): Promise<GooglePlace | null> {
    return fetchGooglePlaceById(googlePlaceId);
  },

  async getByIds(googlePlaceIds: string[]): Promise<GooglePlace[]> {
    return fetchGooglePlacesByIds(googlePlaceIds);
  },

  async upsert(googlePlace: GooglePlace): Promise<void> {
    void googlePlace;
    throw new Error('googlePlaceRepository.upsert is not implemented yet');
  },
};
