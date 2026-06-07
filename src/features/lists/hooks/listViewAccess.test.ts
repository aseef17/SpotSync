import { describe, expect, it } from 'vitest';
import { shouldClearStaleListView } from '@/features/lists/hooks/listViewAccess';

describe('shouldClearStaleListView', () => {
  it('clears the view when a list id is active but context no longer has that list', () => {
    expect(shouldClearStaleListView(undefined, 'list-1')).toBe(true);
  });

  it('keeps the view when the list is still present in context', () => {
    expect(shouldClearStaleListView({ id: 'list-1' }, 'list-1')).toBe(false);
  });

  it('does nothing when no list is being viewed', () => {
    expect(shouldClearStaleListView(undefined, undefined)).toBe(false);
  });
});
