import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  CURRENT_PLACE_DATA_VERSION,
  getStoredPlaceDataVersion,
  isLegacyCachedPlaceId,
  markPlaceDataMigrationComplete,
  needsPlaceDataMigration,
} from '@/lib/localDb/placeDataMigration';


const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

const VERSION_KEY = 'spotsync-place-data-version';

describe('placeDataMigration', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('treats membership composite IDs as current-format cache rows', () => {
    expect(
      isLegacyCachedPlaceId({
        id: 'list-1_ChIJabc123',
        listId: 'list-1',
      })
    ).toBe(false);
  });

  it('treats legacy auto IDs as stale cache rows', () => {
    expect(
      isLegacyCachedPlaceId({
        id: 'oOWcvUUsoZcKQ9BlVo9X',
        listId: 'HyZTJFSNAOG0VQ9e2Wto',
      })
    ).toBe(true);
  });

  it('requires migration until the version marker is set', () => {
    expect(getStoredPlaceDataVersion()).toBe(1);
    expect(needsPlaceDataMigration()).toBe(true);

    markPlaceDataMigrationComplete();

    expect(getStoredPlaceDataVersion()).toBe(CURRENT_PLACE_DATA_VERSION);
    expect(needsPlaceDataMigration()).toBe(false);
  });

  it('requires migration when the stored version is behind', () => {
    localStorage.setItem(VERSION_KEY, '1');
    expect(needsPlaceDataMigration()).toBe(true);
  });
});
