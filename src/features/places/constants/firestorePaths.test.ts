import { describe, expect, it } from 'vitest';
import {
  listPlaceMembershipDocId,
  normalizeGooglePlaceId,
} from '@/features/places/constants/firestorePaths';

describe('normalizeGooglePlaceId', () => {
  it('strips the Places API resource prefix for bare place ids', () => {
    expect(normalizeGooglePlaceId('places/ChIJabc123')).toBe('ChIJabc123');
  });

  it('leaves already-normalized ids unchanged', () => {
    expect(normalizeGooglePlaceId('ChIJabc123')).toBe('ChIJabc123');
  });

  it('does not alter photo resource names', () => {
    const photoRef = 'places/ChIJabc123/photos/AbcXYZ';
    expect(normalizeGooglePlaceId(photoRef)).toBe(photoRef);
  });
});

describe('listPlaceMembershipDocId', () => {
  it('builds slash-free membership ids from normalized google place ids', () => {
    const googlePlaceId = normalizeGooglePlaceId('places/ChIJabc123');
    expect(listPlaceMembershipDocId('list1', googlePlaceId)).toBe('list1_ChIJabc123');
  });
});
