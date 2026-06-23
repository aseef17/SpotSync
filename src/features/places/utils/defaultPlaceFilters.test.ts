import { describe, expect, it } from 'vitest';
import {
  countActivePlaceFilters,
  getDefaultPlaceFilters,
  getEmptyPlaceFilters,
  hasActivePlaceFilters,
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

  it('treats enabled default toggles as active filters', () => {
    expect(hasActivePlaceFilters({ openNow: true })).toBe(true);
    expect(countActivePlaceFilters({ openNow: true })).toBe(1);
    expect(hasActivePlaceFilters({ passportHasStamp: true, openNow: true })).toBe(true);
    expect(countActivePlaceFilters({ passportHasStamp: true, openNow: true })).toBe(2);
  });

  it('does not count disabled toggles as active filters', () => {
    expect(hasActivePlaceFilters({ openNow: undefined })).toBe(false);
    expect(hasActivePlaceFilters({ passportHasStamp: undefined, openNow: undefined })).toBe(false);
    expect(countActivePlaceFilters({ openNow: undefined })).toBe(0);
  });

  it('counts additive filters with default toggles', () => {
    expect(countActivePlaceFilters({ status: 'visited', openNow: true })).toBe(2);
    expect(countActivePlaceFilters({ searchQuery: 'pizza', openNow: true })).toBe(2);
  });

  it('clear resets to an empty filter set', () => {
    expect(getEmptyPlaceFilters()).toEqual({});
    expect(hasActivePlaceFilters(getEmptyPlaceFilters())).toBe(false);
  });
});
