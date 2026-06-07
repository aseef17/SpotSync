export function shouldClearStaleListView(
  listFromContext: unknown,
  listId: string | undefined
): boolean {
  return !!listId && !listFromContext;
}
