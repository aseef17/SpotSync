export function shouldClearStaleListView(
  listFromContext: unknown,
  listId: string | undefined
): boolean {
  return !!listId && !listFromContext;
}

/** Gate async cache hydration so a late completion cannot restore data after access loss. */
export function shouldApplyCachedListDetails(
  listInContext: unknown,
  listAccessible: boolean
): boolean {
  return !!listInContext || listAccessible;
}
