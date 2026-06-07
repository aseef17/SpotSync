import { describe, expect, it } from 'vitest';
import { listDroppedFromContext } from '@/features/lists/hooks/listContextAccess';

describe('listDroppedFromContext', () => {
  it('clears the view when the current list disappears from context', () => {
    expect(
      listDroppedFromContext('list-a', { listId: 'list-a', hadContext: true }, false)
    ).toBe(true);
  });

  it('does not clear when the list was never in context', () => {
    expect(
      listDroppedFromContext('list-a', { listId: 'list-a', hadContext: false }, false)
    ).toBe(false);
  });

  it('does not clear when navigating to a different list', () => {
    expect(
      listDroppedFromContext('list-b', { listId: 'list-a', hadContext: true }, false)
    ).toBe(false);
  });

  it('does not clear while the list remains in context', () => {
    expect(
      listDroppedFromContext('list-a', { listId: 'list-a', hadContext: true }, true)
    ).toBe(false);
  });
});
