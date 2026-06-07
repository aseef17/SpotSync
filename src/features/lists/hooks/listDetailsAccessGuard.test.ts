import { describe, expect, it } from 'vitest';
import { shouldClearStaleListContextView } from '@/features/lists/hooks/listDetailsAccessGuard';
import type { PlaceList } from '@/features/lists/types/list';

const list = (id: string): PlaceList => ({ id, name: id }) as PlaceList;

describe('shouldClearStaleListContextView', () => {
  it('clears when a list drops out of context (access revoked or account switch)', () => {
    expect(shouldClearStaleListContextView(true, undefined, 'list-1')).toBe(true);
  });

  it('does not clear on first load via direct URL when context was never populated', () => {
    expect(shouldClearStaleListContextView(false, undefined, 'list-1')).toBe(false);
  });

  it('does not clear while the list is still present in context', () => {
    expect(shouldClearStaleListContextView(true, list('list-1'), 'list-1')).toBe(false);
  });
});
