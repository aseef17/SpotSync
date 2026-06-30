import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumeListPublishFromCache,
  resetListPublishMetaForTests,
  stageListPublishFromCache,
} from '@/lib/localDb/sync/listPublishMeta';

describe('listPublishMeta', () => {
  beforeEach(() => {
    resetListPublishMetaForTests();
  });

  it('defaults to cache when no publish was staged', () => {
    expect(consumeListPublishFromCache('list-1')).toBe(true);
  });

  it('stages and consumes Firestore cache vs server snapshot source', () => {
    stageListPublishFromCache('list-1', true);
    expect(consumeListPublishFromCache('list-1')).toBe(true);

    stageListPublishFromCache('list-1', false);
    expect(consumeListPublishFromCache('list-1')).toBe(false);
  });

  it('tracks publish metadata independently per list', () => {
    stageListPublishFromCache('list-a', false);
    stageListPublishFromCache('list-b', true);

    expect(consumeListPublishFromCache('list-a')).toBe(false);
    expect(consumeListPublishFromCache('list-b')).toBe(true);
  });
});
