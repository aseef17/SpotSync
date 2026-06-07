import { describe, expect, it } from 'vitest';
import type { GooglePlace } from '@/features/places/types/googlePlace';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';
import { resolvePlaceView, resolvePlaceViews } from '@/features/places/utils/resolvePlaceView';

const baseGooglePlace = (overrides: Partial<GooglePlace> = {}): GooglePlace => ({
  googlePlaceId: 'ChIJabc',
  name: 'Test Cafe',
  address: '1 Main St',
  location: { lat: 37.77, lng: -122.42 },
  rating: 4.5,
  photoUrls: ['https://example.com/photo.jpg'],
  thumbnailUrl: 'https://example.com/thumb.jpg',
  photoCount: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-06-01'),
  ...overrides,
});

const baseMembership = (overrides: Partial<ListPlaceMembership> = {}): ListPlaceMembership => ({
  id: 'list-1_ChIJabc',
  listId: 'list-1',
  googlePlaceId: 'ChIJabc',
  status: 'visited',
  notes: 'Great coffee',
  addedBy: 'user-1',
  addedAt: new Date('2024-02-01'),
  updatedAt: new Date('2024-03-01'),
  ...overrides,
});

describe('resolvePlaceView', () => {
  it('uses membership id as Place.id and splits metadata vs list fields', () => {
    const place = resolvePlaceView(baseGooglePlace(), baseMembership());

    expect(place.id).toBe('list-1_ChIJabc');
    expect(place.listId).toBe('list-1');
    expect(place.googlePlaceId).toBe('ChIJabc');
    expect(place.name).toBe('Test Cafe');
    expect(place.address).toBe('1 Main St');
    expect(place.location).toEqual({ lat: 37.77, lng: -122.42 });
    expect(place.lat).toBe(37.77);
    expect(place.lng).toBe(-122.42);
    expect(place.rating).toBe(4.5);
    expect(place.photoUrls).toEqual(['https://example.com/photo.jpg']);
    expect(place.status).toBe('visited');
    expect(place.notes).toBe('Great coffee');
    expect(place.addedBy).toBe('user-1');
  });

  it('applies optional access fields and client id', () => {
    const place = resolvePlaceView(baseGooglePlace(), baseMembership(), {
      clientId: 'client-stable',
      isPreview: true,
      accessFields: {
        listOwnerId: 'owner-1',
        listIsPublic: true,
        listCollaboratorIds: ['owner-1', 'user-2'],
      },
    });

    expect(place.clientId).toBe('client-stable');
    expect(place.isPreview).toBe(true);
    expect(place.listOwnerId).toBe('owner-1');
    expect(place.listIsPublic).toBe(true);
    expect(place.listCollaboratorIds).toEqual(['owner-1', 'user-2']);
  });
});

describe('resolvePlaceViews', () => {
  it('joins memberships with canonical google places and skips orphans', () => {
    const memberships = [
      baseMembership(),
      baseMembership({
        id: 'list-1_ChIJmissing',
        googlePlaceId: 'ChIJmissing',
      }),
    ];
    const googlePlacesById = new Map([['ChIJabc', baseGooglePlace()]]);

    const places = resolvePlaceViews(memberships, googlePlacesById);

    expect(places).toHaveLength(1);
    expect(places[0]?.id).toBe('list-1_ChIJabc');
  });
});
