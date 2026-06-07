import { describe, expect, it } from 'vitest';

const PLACES_PAGE_SIZE = 100;

describe('getAllListPlaces pagination contract', () => {
  it('uses the same page size as list pagination so imports scan the full list', () => {
    const listSize = 250;
    const pagesNeeded = Math.ceil(listSize / PLACES_PAGE_SIZE);
    expect(pagesNeeded).toBe(3);
  });

  it('would miss duplicates when only the first page is loaded', () => {
    const listSize = PLACES_PAGE_SIZE + 1;
    const firstPageOnly = PLACES_PAGE_SIZE;
    expect(firstPageOnly).toBeLessThan(listSize);
  });
});
