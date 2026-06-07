export function shouldClearStaleListView(
  listFromContext: unknown,
  listId: string | undefined
): boolean {
  return !!listId && !listFromContext;
}

export function shouldApplyListDataUpdate(
  listAccessible: boolean,
  cancelled = false
): boolean {
  return listAccessible && !cancelled;
}
