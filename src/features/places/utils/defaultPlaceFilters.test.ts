import { describe, expect, it } from 'vitest';
import {
  countNonDefaultPlaceFilters,
  getDefaultPlaceFilters,
  hasNonDefaultPlaceFilters,
} from './defaultPlaceFilters';

describe('defaultPlaceFilters', () => {
  it('defaults to Open Now for regular lists', () => {
    expect(getDefaultPlaceFilters(false)).toEqual({ openNow: true });
  });

  it('defaults to Has Stamp and Open Now for passport lists', () => {
    expect(getDefaultPlaceFilters(true)).toEqual({
      passportHasStamp: true,
      openNow: true,
    });
  });

  it('does not treat default toggles as active filters', () => {
    expect(hasNonDefaultPlaceFilters({ openNow: true }, false)).toBe(false);
    expect(
      hasNonDefaultPlaceFilters({ passportHasStamp: true, openNow: true }, true)
    ).toBe(false);
    expect(countNonDefaultPlaceFilters({ openNow: true }, false)).toBe(0);
  });

  it('counts user changes from defaults', () => {
    expect(countNonDefaultPlaceFilters({ openNow: undefined }, false)).toBe(1);
    expect(
      countNonDefaultPlaceFilters({ passportHasStamp: undefined, openNow: true }, true)
    ).toBe(1);
    expect(countNonDefaultPlaceFilters({ status: 'visited', openNow: true }, false)).toBe(1);
  });
});
