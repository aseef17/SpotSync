import { describe, expect, it } from 'vitest';
import {
  shouldApplyCachedListDetails,
  shouldClearStaleListView,
} from '@/features/lists/hooks/listViewAccess';

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

describe('shouldApplyCachedListDetails', () => {
  it('allows hydration while the list is still present in context', () => {
    expect(shouldApplyCachedListDetails({ id: 'list-1' }, false)).toBe(true);
  });

  it('allows hydration for direct subscriptions when access is still valid', () => {
    expect(shouldApplyCachedListDetails(undefined, true)).toBe(true);
  });

  it('blocks late cache hydration after access loss clears the view', () => {
    expect(shouldApplyCachedListDetails(undefined, false)).toBe(false);
  });
});
