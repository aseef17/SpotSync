import { describe, expect, it } from 'vitest';
import { didPlacePhotoFieldsChange } from '@/lib/localDb/placePhotoFields';

describe('didPlacePhotoFieldsChange', () => {
  it('returns false when incoming patch has no photo fields', () => {
    expect(
      didPlacePhotoFieldsChange(
        { photoUrls: ['https://example.com/a.jpg'], thumbnailUrl: 'https://example.com/a.jpg' },
        {}
      )
    ).toBe(false);
  });

  it('returns true when photoUrls change', () => {
    expect(
      didPlacePhotoFieldsChange(
        { photoUrls: ['https://example.com/a.jpg'] },
        { photoUrls: ['https://example.com/b.jpg'] }
      )
    ).toBe(true);
  });

  it('returns true when thumbnailUrl changes', () => {
    expect(
      didPlacePhotoFieldsChange(
        { thumbnailUrl: 'https://example.com/a.jpg' },
        { thumbnailUrl: 'https://example.com/b.jpg' }
      )
    ).toBe(true);
  });

  it('returns false when photoUrls are unchanged', () => {
    const urls = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];
    expect(didPlacePhotoFieldsChange({ photoUrls: urls }, { photoUrls: [...urls] })).toBe(false);
  });
});
